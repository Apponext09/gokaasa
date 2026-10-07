import { notificationRepository } from '../repositories/notification.repository.js';
import { toPage } from './presenters.js';
import { AppError } from '../utils/AppError.js';

function toNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    entityType: row.entity_type,
    entityId: row.entity_id,
    read: row.read_at != null,
    createdAt: row.created_at,
  };
}

export const notificationService = {
  /** The read/write store behind the bell. Creating one (`create`) is done by notifications/notificationService.js's triggers. */
  async create(client, { userId, type, title, message, entityType, entityId }) {
    return notificationRepository.insert(client, { userId, type, title, message, entityType, entityId });
  },

  async list(userId, { page, limit }) {
    const { rows, total } = await notificationRepository.listForUser(userId, { page, limit });
    return toPage(rows.map(toNotification), total, page, limit);
  },

  async unreadCount(userId) {
    return { count: await notificationRepository.unreadCount(userId) };
  },

  async markRead(userId, id) {
    const row = await notificationRepository.markRead(userId, id);
    if (!row) throw AppError.notFound('Notification not found');
    return toNotification(row);
  },

  async markAllRead(userId) {
    await notificationRepository.markAllRead(userId);
    return { success: true };
  },
};
