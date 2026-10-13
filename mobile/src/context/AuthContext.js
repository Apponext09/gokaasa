import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/authApi.js';
import { api, clearSession, loadStoredSession, normalizeError, onSessionExpired, persistSession, refreshAccessToken } from '../api/client.js';

const AuthContext = createContext(null);

/**
 * Session state for the whole app. On launch: restore the cached access token + user from SecureStore
 * immediately (so the UI doesn't flash a login screen for a session that's probably still valid), then
 * confirm/refresh it with a direct call to POST /auth/refresh -- the SAME call the website's own
 * AuthContext.jsx makes on startup, and for the same reason: the shared response interceptor (client.js)
 * deliberately never auto-refreshes a 401 from ANY /auth/* endpoint (including /auth/me), to avoid
 * retrying a bad login attempt or looping on /auth/refresh's own 401. Calling /auth/me here instead would
 * silently sign out a user with a perfectly valid refresh cookie just because the cached 15-minute access
 * token had expired -- a real bug this exact rewrite caught by comparing against the website's own
 * startup flow and the live backend's actual 401 response. If this refresh genuinely fails (expired/
 * missing refresh cookie, or -- see client.js's note -- React Native's documented cookie-handling
 * limitations), the user is simply signed out and shown Login, never left in a broken half-authed state.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'authenticated' | 'guest'

  const signOutLocally = useCallback(async () => {
    await clearSession();
    setUser(null);
    setStatus('guest');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadStoredSession();
      if (cached.user && !cancelled) setUser(cached.user);
      try {
        const session = await refreshAccessToken();
        if (!cancelled) {
          await persistSession(session.accessToken, session.user);
          setUser(session.user);
          setStatus('authenticated');
        }
      } catch {
        if (!cancelled) {
          await signOutLocally();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signOutLocally]);

  useEffect(() => onSessionExpired(() => signOutLocally()), [signOutLocally]);

  const login = useCallback(async (email, password) => {
    try {
      const { accessToken, user: loggedInUser } = await authApi.login({ email, password });
      await persistSession(accessToken, loggedInUser);
      setUser(loggedInUser);
      setStatus('authenticated');
      return { ok: true };
    } catch (err) {
      // `err` here is ALREADY the normalized { status, code, message, fieldErrors } object -- the
      // shared response interceptor in client.js normalizes every rejection from the `api` instance
      // before it ever reaches this catch. Calling normalizeError(err) again used to discard the real
      // server message (e.g. "Invalid email or password") in favour of a generic fallback -- a confirmed
      // bug (verified live against production: a wrong-password login correctly returns a specific
      // message from the server, but it never reached the screen because of this double-normalization).
      return { ok: false, error: err };
    }
  }, []);

  const register = useCallback(async (body) => {
    try {
      const { accessToken, user: newUser } = await authApi.register(body);
      await persistSession(accessToken, newUser);
      setUser(newUser);
      setStatus('authenticated');
      return { ok: true };
    } catch (err) {
      // See the identical note in login() above -- `err` is already normalized.
      return { ok: false, error: err };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Logging out locally still succeeds even if the network call fails.
    }
    await signOutLocally();
  }, [signOutLocally]);

  const refreshProfile = useCallback(async () => {
    try {
      const freshUser = await authApi.me();
      setUser(freshUser);
      return freshUser;
    } catch (err) {
      // The shared interceptor (client.js) already normalized this to { status, code, message,
      // fieldErrors } -- and /auth/me's own 401s are never auto-refreshed by that interceptor (see the
      // startup effect's comment above), so a call made just as the access token happened to expire gets
      // one explicit refresh-and-retry here, rather than failing a perfectly recoverable case.
      if (err?.status === 401) {
        try {
          const session = await refreshAccessToken();
          await persistSession(session.accessToken, session.user);
          setUser(session.user);
          return session.user;
        } catch (refreshErr) {
          await signOutLocally();
          throw normalizeError(refreshErr);
        }
      }
      throw err;
    }
  }, [signOutLocally]);

  const value = useMemo(
    () => ({ user, status, isAuthenticated: status === 'authenticated', isLoading: status === 'loading', login, register, logout, refreshProfile }),
    [user, status, login, register, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

// Exported so screens can reach the shared axios instance without re-importing the client module's path.
export { api };
