import { config } from '../config/index.js';
import { authService } from '../services/auth.service.js';
import { emailChangeService } from '../services/emailChange.service.js';
import { refreshCookieOptions, requestMeta, sendSession } from './sessionCookie.js';

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

  async googleLogin(req, res) {
    const session = await authService.googleLogin(req.validated.body, requestMeta(req));
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

  async changePassword(req, res) {
    await authService.changePassword(req.user.id, req.validated.body, { id: req.user.id, ip: req.ip });
    res.clearCookie(config.auth.refreshCookieName, { ...refreshCookieOptions(), maxAge: undefined });
    return res.status(200).json({ message: 'Password changed successfully. Please sign in again.' });
  },

  async me(req, res) {
    const user = await authService.getProfile(req.user.id);
    return res.json({ user });
  },

  async pendingEmailChange(req, res) {
    const pending = await emailChangeService.pending(req.user.id);
    return res.json({ pending });
  },

  async requestEmailChange(req, res) {
    const pending = await emailChangeService.request(req.user.id, req.validated.body);
    return res.status(202).json({ pending, message: 'A verification code was sent to your new email address.' });
  },

  async resendEmailChange(req, res) {
    const pending = await emailChangeService.resend(req.user.id);
    return res.status(202).json({ pending, message: 'A new verification code was sent.' });
  },

  async verifyEmailChange(req, res) {
    const result = await emailChangeService.verify(req.user.id, req.validated.body.code, { id: req.user.id, ip: req.ip });
    res.clearCookie(config.auth.refreshCookieName, { ...refreshCookieOptions(), maxAge: undefined });
    return res.json({ ...result, message: 'Email changed successfully. Please sign in with your new email.' });
  },

  async cancelEmailChange(req, res) {
    await emailChangeService.cancel(req.user.id);
    return res.status(204).end();
  },
};
