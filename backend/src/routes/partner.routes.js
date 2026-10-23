import { Router } from 'express';
import { partnerController } from '../controllers/partner.controller.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { otpLimiter, partnerRegisterLimiter } from '../middleware/rateLimiters.js';
import { uploadSingleDocument } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { requireOwnDocumentOrAdmin } from '../middleware/partnerAccess.js';
import {
  documentUploadFields,
  otpRequestSchema,
  otpVerifySchema,
  ownDocumentParam,
  partnerRegisterSchema,
} from '../validators/partner.validator.js';

export const partnerRouter = Router();

// Public: account + business + property info, OTP email verification. No session until verify-otp.
partnerRouter.post('/register', partnerRegisterLimiter, validate({ body: partnerRegisterSchema }), partnerController.register);
partnerRouter.post('/resend-otp', otpLimiter, validate({ body: otpRequestSchema }), partnerController.resendOtp);
partnerRouter.post('/verify-otp', otpLimiter, validate({ body: otpVerifySchema }), partnerController.verifyOtp);

// Authenticated, not yet necessarily approved: the applicant manages their own application.
const owner = [authenticate, authorize('HOTEL_OWNER')];
partnerRouter.get('/application', owner, partnerController.getApplication);
partnerRouter.post('/application/submit', owner, partnerController.submit);
partnerRouter.post(
  '/documents',
  owner,
  uploadSingleDocument,
  validate({ body: documentUploadFields }),
  partnerController.uploadDocument,
);
partnerRouter.get(
  '/documents/:docId/file',
  authenticate,
  validate({ params: ownDocumentParam }),
  requireOwnDocumentOrAdmin,
  partnerController.getDocumentFile,
);
