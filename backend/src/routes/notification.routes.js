import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { notificationIdParam, notificationListQuery } from '../validators/notification.validator.js';

export const notificationRouter = Router();
notificationRouter.use(authenticate);
notificationRouter.get('/', validate({ query: notificationListQuery }), notificationController.list);
notificationRouter.get('/unread-count', notificationController.unreadCount);
notificationRouter.patch('/read-all', notificationController.markAllRead);
notificationRouter.patch('/:id/read', validate({ params: notificationIdParam }), notificationController.markRead);
