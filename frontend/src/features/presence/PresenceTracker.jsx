import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { presenceApi } from '@/services/endpoints.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { PRESENCE_CONFIG } from '@/config/presence.js';
import { shouldSendImmediateHeartbeat } from '@/features/users/presenceFormat.js';

function endSessionBeacon(sessionId) {
  const payload = JSON.stringify({ sessionId });
  if (navigator.sendBeacon) {
    // Survives the tab actually closing; a cancellable fetch/axios call does not.
    navigator.sendBeacon('/api/presence/session/end', new Blob([payload], { type: 'application/json' }));
  } else {
    presenceApi.end({ sessionId }).catch(() => {});
  }
}

/**
 * Mounted once near the router root (see App.jsx). Opens one presence session per authenticated tab,
 * heartbeats it on an interval and on route changes, pauses while the tab is hidden, and ends the
 * session on sign-out or tab close. Never runs for a signed-out visitor.
 */
export function PresenceTracker() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const stateRef = useRef({ sessionId: null, lastSentAt: 0, starting: null });

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const state = stateRef.current;

    async function ensureSession() {
      if (state.sessionId || state.starting) return state.starting;
      state.starting = presenceApi
        .start({ platform: 'web', route: window.location.pathname })
        .then((session) => {
          state.sessionId = session.sessionId;
          state.lastSentAt = Date.now();
          return state.sessionId;
        })
        .catch(() => null)
        .finally(() => {
          state.starting = null;
        });
      return state.starting;
    }

    async function heartbeat(route) {
      if (document.visibilityState === 'hidden') return;
      await ensureSession();
      if (!state.sessionId) return;
      try {
        await presenceApi.heartbeat({ sessionId: state.sessionId, route });
        state.lastSentAt = Date.now();
      } catch {
        // A transient failure just waits for the next scheduled tick; it's not worth surfacing to the user.
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') heartbeat(window.location.pathname);
    };
    const onPageHide = () => {
      if (state.sessionId) endSessionBeacon(state.sessionId);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    ensureSession();
    const timer = setInterval(() => heartbeat(window.location.pathname), PRESENCE_CONFIG.heartbeatIntervalMs);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      clearInterval(timer);
      // Sign-out (isAuthenticated flips to false) and unmount both land here -- actual tab close is
      // handled by the 'pagehide' listener above instead, since this cleanup never runs for that case.
      if (state.sessionId) {
        endSessionBeacon(state.sessionId);
        state.sessionId = null;
      }
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const state = stateRef.current;
    if (!state.sessionId) return; // the effect above's initial ensureSession() already carries the first route
    if (!shouldSendImmediateHeartbeat(Date.now(), state.lastSentAt, PRESENCE_CONFIG.heartbeatIntervalMs)) return;
    presenceApi
      .heartbeat({ sessionId: state.sessionId, route: location.pathname })
      .then(() => {
        state.lastSentAt = Date.now();
      })
      .catch(() => {});
  }, [isAuthenticated, location.pathname]);

  return null;
}
