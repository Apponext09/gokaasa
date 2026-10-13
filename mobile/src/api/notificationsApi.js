import { api } from './client.js';

export const notificationsApi = {
  list: (params) => api.get('/notifications', { params }).then((r) => r.data),
  unreadCount: () => api.get('/notifications/unread-count').then((r) => r.data.count),
  markRead: (id) => api.patch(`/notifications/${id}/read`).then((r) => r.data.notification),
  markAllRead: () => api.patch('/notifications/read-all').then((r) => r.data),
};
