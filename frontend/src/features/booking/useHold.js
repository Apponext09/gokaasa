import { useCallback, useEffect, useState } from 'react';
import { bookingApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

/**
 * Reads a hold from the server. The server is the only source of truth for a hold's status, expiry and price,
 * so every booking page loads it, and re-loads it when the countdown ends or a request says the hold is gone.
 */
export function useHold(holdId) {
  const [state, setState] = useState({ hold: null, loading: Boolean(holdId), error: null });

  const load = useCallback(async () => {
    if (!holdId) {
      setState({ hold: null, loading: false, error: null });
      return;
    }
    try {
      const hold = await bookingApi.hold(holdId);
      setState({ hold, loading: false, error: null });
    } catch (err) {
      setState({ hold: null, loading: false, error: normalizeError(err) });
    }
  }, [holdId]);

  useEffect(() => {
    load();
  }, [load]);

  const setHold = useCallback((hold) => setState((current) => ({ ...current, hold })), []);

  return { ...state, reload: load, setHold };
}
