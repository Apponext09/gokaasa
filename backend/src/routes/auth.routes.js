import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import {
  forgotPasswordSchema,
  guestCheckoutSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/auth.validator.js';

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
authRouter.post('/guest-checkout', authLimiter, validate({ body: guestCheckoutSchema }), authController.guestCheckout);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), authController.forgotPassword);
authRouter.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), authController.resetPassword);
authRouter.get('/me', authenticate, authController.me);
