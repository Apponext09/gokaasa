import { Router } from 'express';
import { offerController } from '../controllers/offer.controller.js';

/** Public offer discovery, mounted at /api/offers. No auth -- nothing here is customer-specific. */
export const offerRouter = Router();
offerRouter.get('/', offerController.list);
