import { api } from './client.js';

/** Mirrors the website's authApi (frontend/src/services/endpoints.js) 1:1 -- same backend, same contract. */
export const authApi = {
  register: (body) => api.post('/auth/register', body).then((r) => r.data),
  login: (body) => api.post('/auth/login', body).then((r) => r.data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me').then((r) => r.data.user),
  forgotPassword: (body) => api.post('/auth/forgot-password', body).then((r) => r.data),
  resetPassword: (body) => api.post('/auth/reset-password', body).then((r) => r.data),
};
