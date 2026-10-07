import { notificationService } from '../services/notification.service.js';

/** Every call is scoped to req.user.id -- a notification belonging to someone else is never reachable. */
export const notificationController = {
  async list(req, res) {
    return res.json(await notificationService.list(req.user.id, req.validated.query));
  },

  async unreadCount(req, res) {
    return res.json(await notificationService.unreadCount(req.user.id));
  },

  async markRead(req, res) {
    return res.json({ notification: await notificationService.markRead(req.user.id, req.validated.params.id) });
  },

  async markAllRead(req, res) {
    return res.json(await notificationService.markAllRead(req.user.id));
  },
};
