import { presenceRepository } from '../repositories/presence.repository.js';
import { authRepository } from '../repositories/auth.repository.js';
import { auditService } from './audit.service.js';
import { withTransaction } from '../db/pool.js';
import { AppError } from '../utils/AppError.js';
import { toPage } from './presenters.js';
import { config } from '../config/index.js';
import { localToday, zonedTimeToInstant } from '../domain/businessDate.js';

const ONLINE_TIMEOUT_SECONDS = config.presence.onlineTimeoutSeconds;
const AWAY_TIMEOUT_SECONDS = config.presence.awayTimeoutSeconds;

function presenceStatus(lastHeartbeatAt) {
  if (!lastHeartbeatAt) return 'offline';
  const ageSeconds = (Date.now() - new Date(lastHeartbeatAt).getTime()) / 1000;
  if (ageSeconds <= ONLINE_TIMEOUT_SECONDS) return 'online';
  if (ageSeconds <= AWAY_TIMEOUT_SECONDS) return 'away';
  return 'offline';
}

function toUserRow(row) {
  const session = row.session_id
    ? {
        id: row.session_id,
        platform: row.platform,
        browser: row.browser ?? null,
        os: row.os ?? null,
        route: row.current_route ?? null,
        routeLabel: row.current_route_label ?? 'Not available',
        startedAt: row.session_started_at,
        lastHeartbeatAt: row.last_heartbeat_at,
      }
    : null;

  return {
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(' '),
    email: row.email,
    phone: row.phone,
    roles: row.role_codes ?? [],
    isActive: row.is_active,
    joinedAt: row.created_at,
    lastLoginAt: row.last_login_at,
    presenceStatus: presenceStatus(row.last_heartbeat_at),
    session,
  };
}

export const adminUserService = {
  async list(query) {
    const { rows, total } = await presenceRepository.adminList(query, ONLINE_TIMEOUT_SECONDS);
    return toPage(rows.map(toUserRow), total, query.page, query.limit);
  },

  async detail(userId) {
    const row = await presenceRepository.adminFindById(userId);
    if (!row) throw AppError.notFound('User not found');
    const sessions = await presenceRepository.listSessionsForUser(userId, { limit: 20 });
    // adminFindById has no session join of its own (unlike the list query's LATERAL join) -- the
    // current/most-recent-active session is picked from the sessions list instead, so presenceStatus
    // and the "session" summary field are never silently stale here.
    const activeSession = sessions.find((s) => s.ended_at == null) ?? null;
    const rowWithSession = {
      ...row,
      session_id: activeSession?.id,
      platform: activeSession?.platform,
      browser: activeSession?.browser,
      os: activeSession?.os,
      current_route: activeSession?.current_route,
      current_route_label: activeSession?.current_route_label,
      session_started_at: activeSession?.started_at,
      last_heartbeat_at: activeSession?.last_heartbeat_at,
    };
    return {
      ...toUserRow(rowWithSession),
      sessions: sessions.map((s) => ({
        id: s.id,
        platform: s.platform,
        browser: s.browser ?? null,
        os: s.os ?? null,
        route: s.current_route ?? null,
        routeLabel: s.current_route_label ?? 'Not available',
        startedAt: s.started_at,
        lastHeartbeatAt: s.last_heartbeat_at,
        endedAt: s.ended_at,
        active: s.ended_at == null,
      })),
    };
  },

  /** Mirrors adminCustomer.service.js#setStatus, generalised to every role. Deactivating revokes every refresh token (signs them out everywhere) and closes every open presence session. */
  async setStatus(userId, isActive, actor) {
    const row = await presenceRepository.adminFindById(userId);
    if (!row) throw AppError.notFound('User not found');
    if (row.is_active === isActive) return this.detail(userId);

    await withTransaction(async (client) => {
      await client.query(`UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1`, [userId, isActive]);
      if (!isActive) {
        await authRepository.revokeAllForUser(client, userId);
        await presenceRepository.endAllForUser(client, userId);
      }
      await auditService.record(client, {
        actor,
        action: isActive ? 'user.activated' : 'user.deactivated',
        entity: 'user',
        entityId: userId,
        oldValue: { isActive: row.is_active },
        newValue: { isActive },
      });
    });
    return this.detail(userId);
  },

  /** Signs the account out everywhere by revoking every refresh token server-side. Access tokens already in a browser remain valid for their own natural lifetime (<=15 min) -- the same documented tradeoff as adminCustomer.service.js. This does not touch presence rows, which just stop heartbeating once the tab is forced to re-authenticate. */
  async forceSignOut(userId, actor) {
    const row = await presenceRepository.adminFindById(userId);
    if (!row) throw AppError.notFound('User not found');
    await withTransaction(async (client) => {
      await authRepository.revokeAllForUser(client, userId);
      await auditService.record(client, { actor, action: 'user.force_signout', entity: 'user', entityId: userId });
    });
    return { signedOut: true };
  },

  /** Ends one presence/activity session. This only stops it showing as "online" on the dashboard -- it is not an auth revocation (see forceSignOut for that). The end and its audit record commit atomically, same as setStatus/forceSignOut. */
  async revokeSession(userId, sessionId, actor) {
    const row = await presenceRepository.adminFindById(userId);
    if (!row) throw AppError.notFound('User not found');
    await withTransaction(async (client) => {
      const ended = await presenceRepository.endSession(sessionId, userId, client);
      if (!ended) throw AppError.notFound('Session not found or already ended');
      await auditService.record(client, { actor, action: 'user.session_revoked', entity: 'user_session', entityId: sessionId });
    });
    return { ended: true };
  },

  async kpis() {
    const eligibleSince = zonedTimeToInstant(localToday(config.booking.businessTimezone), '00:00', config.booking.businessTimezone);
    return presenceRepository.kpis({ onlineTimeoutSeconds: ONLINE_TIMEOUT_SECONDS, eligibleSince });
  },
};
