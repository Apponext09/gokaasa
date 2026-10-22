import { Router } from 'express';
import { presenceController } from '../controllers/presence.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { presenceLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import { endSessionSchema, heartbeatSchema, startSessionSchema } from '../validators/presence.validator.js';

/**
 * Presence is derived purely from the caller's own authenticated identity (`req.user.id`) -- never
 * from a client-supplied user id -- so one user can never mark another online, offline, or on a
 * particular page.
 */
export const presenceRouter = Router();

presenceRouter.use(authenticate, presenceLimiter);
presenceRouter.post('/session', validate({ body: startSessionSchema }), presenceController.start);
presenceRouter.post('/heartbeat', validate({ body: heartbeatSchema }), presenceController.heartbeat);
presenceRouter.post('/session/end', validate({ body: endSessionSchema }), presenceController.end);
