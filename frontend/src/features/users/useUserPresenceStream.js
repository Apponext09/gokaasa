import { useEffect, useRef } from 'react';
import { adminApi } from '@/services/endpoints.js';

/**
 * Subscribes the admin User Management page to live presence deltas over SSE. A one-time ticket is
 * minted per connection attempt (EventSource can't send an Authorization header -- see
 * streamTicket.service.js on the backend), so reconnecting after a drop always fetches a fresh ticket
 * rather than retrying a consumed one. Manual backoff replaces the browser's built-in EventSource retry
 * for exactly that reason.
 */
export function useUserPresenceStream({ enabled, onUpdate, onEnd, onStatusChange }) {
  const callbacksRef = useRef({});
  callbacksRef.current = { onUpdate, onEnd, onStatusChange };

  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    let source = null;
    let retry = 0;
    let retryTimer = null;

    function scheduleRetry() {
      if (stopped) return;
      callbacksRef.current.onStatusChange?.('reconnecting');
      const delay = Math.min(15_000, 1000 * 2 ** retry);
      retry += 1;
      retryTimer = setTimeout(connect, delay);
    }

    async function connect() {
      if (stopped) return;
      try {
        const { ticket } = await adminApi.issueUserStreamTicket();
        if (stopped) return;
        source = new EventSource(`/api/admin/users/stream?ticket=${encodeURIComponent(ticket)}`);
        source.addEventListener('connected', () => {
          retry = 0;
          callbacksRef.current.onStatusChange?.('live');
        });
        source.addEventListener('session:updated', (event) => callbacksRef.current.onUpdate?.(JSON.parse(event.data)));
        source.addEventListener('session:ended', (event) => callbacksRef.current.onEnd?.(JSON.parse(event.data)));
        source.onerror = () => {
          source?.close();
          scheduleRetry();
        };
      } catch {
        scheduleRetry();
      }
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [enabled]);
}
