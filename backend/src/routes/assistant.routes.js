import { Router } from 'express';
import { assistantController } from '../controllers/assistant.controller.js';
import { aiAssistantLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import { assistantExtractSchema } from '../validators/assistant.validator.js';

/**
 * Mode B: natural-language requirement extraction. Public (no auth required, same as search itself) --
 * the assistant never collects or needs anything account-specific to turn a sentence into search filters.
 * Rate-limited since this is a paid per-call AI request.
 */
export const assistantRouter = Router();
assistantRouter.get('/status', assistantController.status);
assistantRouter.post('/extract', aiAssistantLimiter, validate({ body: assistantExtractSchema }), assistantController.extract);
