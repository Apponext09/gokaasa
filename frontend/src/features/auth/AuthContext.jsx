import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, partnerApi } from '@/services/endpoints.js';
import { refreshAccessToken, SESSION_EXPIRED_EVENT, tokenStore } from '@/services/api.js';

const AuthContext = createContext(null);

export const ADMIN_ROLES = ['ADMIN', 'HOTEL_MANAGER'];

/**
 * A HOTEL_OWNER reuses the same /admin/* surface as ADMIN/HOTEL_MANAGER, but only once their partner
 * application is APPROVED (the backend enforces this independently -- this is purely for routing).
 */
export function isApprovedStaff(user) {
  if (!user?.roles) return false;
  if (user.roles.some((role) => ADMIN_ROLES.includes(role))) return true;
  return user.roles.includes('HOTEL_OWNER') && user.partnerStatus === 'APPROVED';
}

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

  const verifyPartnerOtp = useCallback(
    async (payload) => applySession(await partnerApi.verifyOtp(payload)),
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
      isStaff: isApprovedStaff(user),
      isAdmin: Boolean(user?.roles?.includes('ADMIN')),
      login,
      register,
      guestCheckout,
      verifyPartnerOtp,
      logout,
    }),
    [user, status, login, register, guestCheckout, verifyPartnerOtp, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
