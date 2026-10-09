import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '@/services/endpoints.js';
import { refreshAccessToken, SESSION_EXPIRED_EVENT, tokenStore } from '@/services/api.js';

const AuthContext = createContext(null);

export const ADMIN_ROLES = ['ADMIN', 'HOTEL_MANAGER'];

/**
 * Session state for the whole app. On first load the refresh cookie is exchanged for an access token,
 * so a page reload keeps the user signed in without storing anything in JavaScript-readable storage.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  const applySession = useCallback((session) => {
    tokenStore.set(session.accessToken);
    setUser(session.user);
    setStatus('authenticated');
    return session.user;
  }, []);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshAccessToken()
      .then((session) => {
        if (!cancelled) applySession(session);
      })
      .catch(() => {
        if (!cancelled) clearSession();
      });
    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession]);

  useEffect(() => {
    const onExpired = () => clearSession();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [clearSession]);

  const login = useCallback(
    async (credentials) => applySession(await authApi.login(credentials)),
    [applySession],
  );

  const register = useCallback(
    async (details) => applySession(await authApi.register(details)),
    [applySession],
  );

  // Feature 2: books without ever showing a login/sign-up form. Returns a completely ordinary session --
  // from here the guest is an authenticated CUSTOMER like any other, through every existing route.
  const guestCheckout = useCallback(
    async (contact) => applySession(await authApi.guestCheckout(contact)),
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      isStaff: Boolean(user?.roles?.some((role) => ADMIN_ROLES.includes(role))),
      isAdmin: Boolean(user?.roles?.includes('ADMIN')),
      login,
      register,
      guestCheckout,
      logout,
    }),
    [user, status, login, register, guestCheckout, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
