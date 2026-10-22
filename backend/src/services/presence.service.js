import { presenceRepository } from '../repositories/presence.repository.js';
import { normalizeRoute } from '../domain/routeNormalization.js';
import { parseUserAgent } from '../domain/userAgent.js';
import { presenceEvents, PRESENCE_SESSION_ENDED, PRESENCE_SESSION_UPDATED } from './presenceEvents.js';
import { AppError } from '../utils/AppError.js';

const ALLOWED_PLATFORMS = new Set(['web', 'android', 'ios']);

function toSessionEvent(userId, row) {
  return {
    userId,
    sessionId: row.id,
    platform: row.platform,
    browser: row.browser,
    os: row.os,
    route: row.current_route,
    routeLabel: row.current_route_label,
    startedAt: row.started_at,
    lastHeartbeatAt: row.last_heartbeat_at,
  };
}

/**
 * Self-service presence: the authenticated caller starts a session, heartbeats it while the tab is
 * open and active, and ends it on logout/unload. Every call is scoped to `req.user.id` -- a session
 * can only ever be touched by the user who opened it.
 */
export const presenceService = {
  async startSession(userId, { platform, userAgent, route } = {}) {
    const safePlatform = ALLOWED_PLATFORMS.has(platform) ? platform : 'web';
    const { browser, os } = parseUserAgent(userAgent);
    const { route: normalizedRoute, label } = normalizeRoute(route);

    const session = await presenceRepository.startSession(userId, {
      platform: safePlatform,
      browser,
      os,
      route: normalizedRoute,
      routeLabel: label,
    });

    const eventRow = { ...session, platform: safePlatform, browser, os, current_route: normalizedRoute, current_route_label: label };
    presenceEvents.emit(PRESENCE_SESSION_UPDATED, toSessionEvent(userId, eventRow));
    return { sessionId: session.id, startedAt: session.started_at };
  },

  async heartbeat(userId, sessionId, { route } = {}) {
    const normalized = route != null ? normalizeRoute(route) : null;
    const updated = await presenceRepository.heartbeat(sessionId, userId, {
      route: normalized?.route,
      routeLabel: normalized?.label,
    });
    if (!updated) throw AppError.notFound('Session not found or already ended');

    presenceEvents.emit(PRESENCE_SESSION_UPDATED, {
      userId,
      sessionId: updated.id,
      route: updated.current_route,
      routeLabel: updated.current_route_label,
      lastHeartbeatAt: updated.last_heartbeat_at,
    });
    return { lastHeartbeatAt: updated.last_heartbeat_at };
  },

  async endSession(userId, sessionId) {
    const ended = await presenceRepository.endSession(sessionId, userId);
    if (ended) presenceEvents.emit(PRESENCE_SESSION_ENDED, { userId, sessionId });
    return { ended };
  },
};
