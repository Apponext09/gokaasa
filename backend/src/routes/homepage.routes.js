import { Router } from 'express';
import { homepageBackgroundController } from '../controllers/homepageBackground.controller.js';

export const homepageRouter = Router();
homepageRouter.get('/background-images', homepageBackgroundController.list);

