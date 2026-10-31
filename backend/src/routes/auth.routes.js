import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate, requirePermission } from '../middleware/authenticate.js';
import { authLimiter, otpLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import {
  forgotPasswordSchema,
  changePasswordSchema,
  emailChangeRequestSchema,
  emailChangeVerifySchema,
  guestCheckoutSchema,
  googleAuthSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/auth.validator.js';

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
authRouter.post('/guest-checkout', authLimiter, validate({ body: guestCheckoutSchema }), authController.guestCheckout);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
authRouter.post('/google', authLimiter, validate({ body: googleAuthSchema }), authController.googleLogin);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), authController.forgotPassword);
authRouter.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), authController.resetPassword);
authRouter.post('/change-password', authLimiter, authenticate, validate({ body: changePasswordSchema }), authController.changePassword);
authRouter.get('/me', authenticate, authController.me);
authRouter.get('/email-change', authenticate, requirePermission('console.access'), authController.pendingEmailChange);
authRouter.post('/email-change/request', otpLimiter, authenticate, requirePermission('console.access'), validate({ body: emailChangeRequestSchema }), authController.requestEmailChange);
authRouter.post('/email-change/resend', otpLimiter, authenticate, requirePermission('console.access'), authController.resendEmailChange);
authRouter.post('/email-change/verify', otpLimiter, authenticate, requirePermission('console.access'), validate({ body: emailChangeVerifySchema }), authController.verifyEmailChange);
authRouter.delete('/email-change', authenticate, requirePermission('console.access'), authController.cancelEmailChange);
