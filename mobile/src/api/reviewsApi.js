import { api } from './client.js';

export const reviewsApi = {
  hotelReviews: (ref, params) => api.get(`/hotels/${encodeURIComponent(ref)}/reviews`, { params }).then((r) => r.data),
  eligibility: (bookingId) => api.get(`/reviews/eligibility/${bookingId}`).then((r) => r.data),
  create: (body) => api.post('/reviews', body).then((r) => r.data.review),
  update: (id, body) => api.put(`/reviews/${id}`, body).then((r) => r.data.review),
  remove: (id) => api.delete(`/reviews/${id}`),
  mine: () => api.get('/reviews/my').then((r) => r.data.reviews),
};
