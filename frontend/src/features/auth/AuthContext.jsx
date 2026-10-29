import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, partnerApi } from '@/services/endpoints.js';
import { refreshAccessToken, SESSION_EXPIRED_EVENT, tokenStore } from '@/services/api.js';
import { isApprovedStaff } from './routing.js';
import { setStaffCustomerView } from './viewMode.js';

const AuthContext = createContext(null);

export { isApprovedStaff };

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
    if (import.meta.env.DEV) console.debug('[auth] session established', { userId: session.user.id, roles: session.user.roles });
    return session.user;
  }, []);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setStaffCustomerView(false);
    setUser(null);
    setStatus('anonymous');
    if (import.meta.env.DEV) console.debug('[auth] session cleared');
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
      isSalesExecutive: Boolean(user?.roles?.includes('SALES_EXECUTIVE')),
      isOnboardingExecutive: Boolean(user?.roles?.includes('HOTEL_ONBOARDING_EXECUTIVE')),
      isReviewExecutive: Boolean(user?.roles?.includes('HOTEL_REVIEW_EXECUTIVE')),
      hasRole: (role) => Boolean(user?.roles?.includes(role)),
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
