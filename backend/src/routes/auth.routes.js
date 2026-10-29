import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { authLimiter, otpLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import {
  forgotPasswordSchema,
  emailChangeRequestSchema,
  emailChangeVerifySchema,
  guestCheckoutSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/auth.validator.js';

const STAFF_ROLES = ['ADMIN', 'HOTEL_MANAGER', 'HOTEL_OWNER', 'SALES_EXECUTIVE', 'HOTEL_ONBOARDING_EXECUTIVE', 'HOTEL_REVIEW_EXECUTIVE'];

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
authRouter.post('/guest-checkout', authLimiter, validate({ body: guestCheckoutSchema }), authController.guestCheckout);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), authController.forgotPassword);
authRouter.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), authController.resetPassword);
authRouter.get('/me', authenticate, authController.me);
authRouter.get('/email-change', authenticate, authorize(...STAFF_ROLES), authController.pendingEmailChange);
authRouter.post('/email-change/request', otpLimiter, authenticate, authorize(...STAFF_ROLES), validate({ body: emailChangeRequestSchema }), authController.requestEmailChange);
authRouter.post('/email-change/resend', otpLimiter, authenticate, authorize(...STAFF_ROLES), authController.resendEmailChange);
authRouter.post('/email-change/verify', otpLimiter, authenticate, authorize(...STAFF_ROLES), validate({ body: emailChangeVerifySchema }), authController.verifyEmailChange);
authRouter.delete('/email-change', authenticate, authorize(...STAFF_ROLES), authController.cancelEmailChange);
