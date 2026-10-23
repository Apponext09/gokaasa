import { config } from '../config/index.js';

const REFRESH_COOKIE_PATH = '/api/auth';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    // Strict + a dedicated path keeps the refresh cookie away from cross-site requests (CSRF).
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: config.auth.refreshTtlDays * 24 * 60 * 60 * 1000,
  };
}

export function requestMeta(req) {
  return { userAgent: req.get('user-agent')?.slice(0, 500), ipAddress: req.ip };
}

/**
 * Shared by every route that issues a session (login, register, partner OTP verification, ...).
 * The cookie's `path` keeps it scoped to /api/auth regardless of which route set it, so refresh/logout
 * keep working unchanged no matter where the session was first issued.
 */
export function sendSession(res, status, session) {
  res.cookie(config.auth.refreshCookieName, session.refreshToken, refreshCookieOptions());
  return res.status(status).json({ accessToken: session.accessToken, user: session.user });
}

export { refreshCookieOptions };
