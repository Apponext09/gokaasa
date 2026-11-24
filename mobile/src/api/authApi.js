import { api } from './client.js';

/** Mirrors the website's authApi (frontend/src/services/endpoints.js) 1:1 -- same backend, same contract. */
export const authApi = {
  register: (body) => api.post('/auth/register', body).then((r) => r.data),
  login: (body) => api.post('/auth/login', body).then((r) => r.data),
  googleLogin: (body) => api.post('/auth/google', body).then((r) => r.data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me').then((r) => r.data.user),
  updateProfile: (body) => api.patch('/auth/me', body).then((r) => r.data.user),
  changePassword: (body) => api.post('/auth/change-password', body).then((r) => r.data),
  forgotPassword: (body) => api.post('/auth/forgot-password', body).then((r) => r.data),
  resetPassword: (body) => api.post('/auth/reset-password', body).then((r) => r.data),
  pendingEmailChange: () => api.get('/auth/email-change').then((r) => r.data.pending),
  requestEmailChange: (body) => api.post('/auth/email-change/request', body).then((r) => r.data),
  resendEmailChange: () => api.post('/auth/email-change/resend').then((r) => r.data),
  verifyEmailChange: (body) => api.post('/auth/email-change/verify', body).then((r) => r.data),
  cancelEmailChange: () => api.delete('/auth/email-change'),
};
