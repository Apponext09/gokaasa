import { Router } from 'express';
import { newsletterController } from '../controllers/newsletter.controller.js';
import { validate } from '../middleware/validate.js';
import { newsletterSubscribeSchema } from '../validators/newsletter.validator.js';

export const newsletterRouter = Router();
newsletterRouter.post('/subscribe', validate({ body: newsletterSubscribeSchema }), newsletterController.subscribe);
