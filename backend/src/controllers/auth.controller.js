import { config } from '../config/index.js';
import { authService } from '../services/auth.service.js';

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

function requestMeta(req) {
  return { userAgent: req.get('user-agent')?.slice(0, 500), ipAddress: req.ip };
}

function sendSession(res, status, session) {
  res.cookie(config.auth.refreshCookieName, session.refreshToken, refreshCookieOptions());
  return res.status(status).json({ accessToken: session.accessToken, user: session.user });
}

export const authController = {
  async register(req, res) {
    const session = await authService.register(req.validated.body, requestMeta(req));
    return sendSession(res, 201, session);
  },

  async guestCheckout(req, res) {
    const session = await authService.guestCheckout(req.validated.body, requestMeta(req));
    return sendSession(res, 200, session);
  },

  async login(req, res) {
    const session = await authService.login(req.validated.body, requestMeta(req));
    return sendSession(res, 200, session);
  },

  async refresh(req, res) {
    const session = await authService.refresh(req.cookies?.[config.auth.refreshCookieName], requestMeta(req));
    return sendSession(res, 200, session);
  },

  async logout(req, res) {
    await authService.logout(req.cookies?.[config.auth.refreshCookieName]);
    res.clearCookie(config.auth.refreshCookieName, { ...refreshCookieOptions(), maxAge: undefined });
    return res.status(204).end();
  },

  async forgotPassword(req, res) {
    await authService.requestPasswordReset(req.validated.body.email);
    return res.status(202).json({
      message: 'If an account exists for that email, a reset link is on its way.',
    });
  },

  async resetPassword(req, res) {
    await authService.resetPassword(req.validated.body);
    return res.status(200).json({ message: 'Your password has been reset. Please sign in again.' });
  },

  async me(req, res) {
    const user = await authService.getProfile(req.user.id);
    return res.json({ user });
  },
};
