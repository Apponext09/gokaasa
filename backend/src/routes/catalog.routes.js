import { Router } from 'express';
import { catalogController } from '../controllers/catalog.controller.js';
import { validate } from '../middleware/validate.js';
import { catalogKindParam } from '../validators/catalog.validator.js';

export const catalogRouter = Router();
catalogRouter.get('/:kind', validate({ params: catalogKindParam }), catalogController.publicList);
