import { api } from './api.js';

/** Thin, typed-by-convention wrappers. Components never build URLs by hand. */
export const authApi = {
  register: (body) => api.post('/auth/register', body).then((r) => r.data),
  login: (body) => api.post('/auth/login', body).then((r) => r.data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me').then((r) => r.data.user),
  forgotPassword: (body) => api.post('/auth/forgot-password', body).then((r) => r.data),
  resetPassword: (body) => api.post('/auth/reset-password', body).then((r) => r.data),
};

export const hotelApi = {
  listPublic: (params) => api.get('/hotels', { params }).then((r) => r.data),
  getPublic: (idOrSlug) => api.get(`/hotels/${encodeURIComponent(idOrSlug)}`).then((r) => r.data.hotel),
  amenities: () => api.get('/amenities').then((r) => r.data.amenities),
};

export const adminApi = {
  dashboard: () => api.get('/admin/dashboard/summary').then((r) => r.data),
  dashboardTrends: (params) => api.get('/admin/dashboard/trends', { params }).then((r) => r.data),
  listHotels: (params) => api.get('/admin/hotels', { params }).then((r) => r.data),
  getHotel: (id) => api.get(`/admin/hotels/${id}`).then((r) => r.data.hotel),
  createHotel: (body) => api.post('/admin/hotels', body).then((r) => r.data.hotel),
  updateHotel: (id, body) => api.patch(`/admin/hotels/${id}`, body).then((r) => r.data.hotel),
  setHotelAmenities: (id, codes) => api.put(`/admin/hotels/${id}/amenities`, { codes }).then((r) => r.data.hotel),
  transitionHotel: (id, action) => api.post(`/admin/hotels/${id}/status`, { action }).then((r) => r.data.hotel),
  verifyFields: (id, fields) => api.post(`/admin/hotels/${id}/verify-fields`, { fields }).then((r) => r.data.hotel),
  syncExternal: (id) => api.post(`/admin/hotels/${id}/sync-external`).then((r) => r.data),
  acceptSuggestion: (id, field) => api.post(`/admin/hotels/${id}/fields/${field}/accept-suggestion`).then((r) => r.data.hotel),
  dismissSuggestion: (id, field) => api.post(`/admin/hotels/${id}/fields/${field}/dismiss-suggestion`).then((r) => r.data.hotel),
  importHistory: (id) => api.get(`/admin/hotels/${id}/import-history`).then((r) => r.data.jobs),

  uploadImage: (id, file, { category, altText }, onProgress) => {
    const form = new FormData();
    form.append('image', file);
    form.append('category', category);
    if (altText) form.append('altText', altText);
    return api
      .post(`/admin/hotels/${id}/images`, form, {
        onUploadProgress: (event) => onProgress?.(event.total ? Math.round((event.loaded / event.total) * 100) : null),
      })
      .then((r) => r.data.image);
  },
  updateImage: (id, imageId, body) => api.patch(`/admin/hotels/${id}/images/${imageId}`, body).then((r) => r.data.image),
  setCover: (id, imageId) => api.post(`/admin/hotels/${id}/images/${imageId}/cover`).then((r) => r.data.image),
  reorderImages: (id, imageIds) => api.put(`/admin/hotels/${id}/images/order`, { imageIds }).then((r) => r.data.images),
  deleteImage: (id, imageId) => api.delete(`/admin/hotels/${id}/images/${imageId}`),
  addProviderImage: (id, sourceUrl) => api.post(`/admin/hotels/${id}/images/from-provider`, { sourceUrl }).then((r) => r.data.image),

  importSearch: (query) => api.post('/admin/hotel-import/search', { query }).then((r) => r.data),
  requestImport: (body) => api.post('/admin/hotel-import/import', body).then((r) => r.data.job),
  importJob: (id) => api.get(`/admin/hotel-import/jobs/${id}`).then((r) => r.data.job),
  importJobs: (params) => api.get('/admin/hotel-import/jobs', { params }).then((r) => r.data),
  importReview: (id) => api.get(`/admin/hotel-import/jobs/${id}/review`).then((r) => r.data),
  discardImport: (id) => api.post(`/admin/hotel-import/jobs/${id}/discard`).then((r) => r.data.job),
  providers: () => api.get('/admin/hotel-import/providers').then((r) => r.data),

  // Hotel manager assignment
  listManagersForHotel: (id) => api.get(`/admin/hotels/${id}/managers`).then((r) => r.data.managers),
  assignManager: (id, userId) => api.post(`/admin/hotels/${id}/managers`, { userId }).then((r) => r.data.managers),
  unassignManager: (id, userId) => api.delete(`/admin/hotels/${id}/managers/${userId}`).then((r) => r.data.managers),
  listManagers: (params) => api.get('/admin/managers', { params }).then((r) => r.data.managers),

  // Bookings, payments, refunds (platform-wide, scoped server-side for a hotel manager)
  listBookings: (params) => api.get('/admin/bookings', { params }).then((r) => r.data),
  getBooking: (id) => api.get(`/admin/bookings/${id}`).then((r) => r.data.booking),
  cancelBooking: (id, body) => api.post(`/admin/bookings/${id}/cancel`, body).then((r) => r.data.booking),
  listPayments: (params) => api.get('/admin/payments', { params }).then((r) => r.data),
  listRefunds: (params) => api.get('/admin/refunds', { params }).then((r) => r.data),

  // Customers
  listCustomers: (params) => api.get('/admin/customers', { params }).then((r) => r.data),
  getCustomer: (id) => api.get(`/admin/customers/${id}`).then((r) => r.data.customer),

  // Audit log (ADMIN only; the backend enforces this)
  listAuditLogs: (params) => api.get('/admin/audit-logs', { params }).then((r) => r.data),

  // Reviews moderation (ADMIN sees every hotel; a HOTEL_MANAGER is scoped server-side to their own)
  listReviews: (params) => api.get('/admin/reviews', { params }).then((r) => r.data),
  moderateReview: (id, action, reason) => api.post(`/admin/reviews/${id}/moderate`, { action, reason }).then((r) => r.data.review),
};

/** Room inventory: room types, room images, rate plans, cancellation policies, calendar and blocks. */
export const roomApi = {
  list: (hotelId, includeArchived = false) =>
    api.get(`/admin/hotels/${hotelId}/room-types`, { params: { includeArchived } }).then((r) => r.data.roomTypes),
  get: (roomId) => api.get(`/admin/room-types/${roomId}`).then((r) => r.data.roomType),
  create: (hotelId, body) => api.post(`/admin/hotels/${hotelId}/room-types`, body).then((r) => r.data.roomType),
  update: (roomId, body) => api.patch(`/admin/room-types/${roomId}`, body).then((r) => r.data.roomType),
  archive: (roomId) => api.post(`/admin/room-types/${roomId}/archive`).then((r) => r.data.roomType),
  setAmenities: (roomId, codes) => api.put(`/admin/room-types/${roomId}/amenities`, { codes }).then((r) => r.data.roomType),

  uploadImage: (roomId, file, onProgress) => {
    const form = new FormData();
    form.append('image', file);
    return api
      .post(`/admin/room-types/${roomId}/images`, form, {
        onUploadProgress: (event) => onProgress?.(event.total ? Math.round((event.loaded / event.total) * 100) : null),
      })
      .then((r) => r.data.image);
  },
  deleteImage: (roomId, imageId) => api.delete(`/admin/room-types/${roomId}/images/${imageId}`),
  setCover: (roomId, imageId) => api.post(`/admin/room-types/${roomId}/images/${imageId}/cover`).then((r) => r.data.images),
  reorderImages: (roomId, imageIds) => api.put(`/admin/room-types/${roomId}/images/order`, { imageIds }).then((r) => r.data.images),

  policies: (hotelId) => api.get(`/admin/hotels/${hotelId}/cancellation-policies`).then((r) => r.data.policies),
  createPolicy: (hotelId, body) => api.post(`/admin/hotels/${hotelId}/cancellation-policies`, body).then((r) => r.data.policy),
  updatePolicy: (policyId, body) => api.patch(`/admin/cancellation-policies/${policyId}`, body).then((r) => r.data.policy),
  archivePolicy: (policyId) => api.post(`/admin/cancellation-policies/${policyId}/archive`),

  ratePlans: (roomId) => api.get(`/admin/room-types/${roomId}/rate-plans`).then((r) => r.data.ratePlans),
  createRatePlan: (roomId, body) => api.post(`/admin/room-types/${roomId}/rate-plans`, body).then((r) => r.data.ratePlan),
  updateRatePlan: (planId, body) => api.patch(`/admin/rate-plans/${planId}`, body).then((r) => r.data.ratePlan),

  calendar: (roomId, { from, to, ratePlanId }) =>
    api.get(`/admin/room-types/${roomId}/calendar`, { params: { from, to, ratePlanId } }).then((r) => r.data),
  bulkCalendar: (roomId, body) => api.post(`/admin/room-types/${roomId}/calendar/bulk`, body).then((r) => r.data),

  blocks: (roomId) => api.get(`/admin/room-types/${roomId}/blocks`).then((r) => r.data.blocks),
  createBlock: (roomId, body) => api.post(`/admin/room-types/${roomId}/blocks`, body).then((r) => r.data.block),
  deleteBlock: (blockId) => api.delete(`/admin/availability-blocks/${blockId}`),
};

export const availabilityApi = {
  search: (hotelId, params) => api.get(`/hotels/${hotelId}/availability`, { params }).then((r) => r.data),
};

/** Customer discovery: search, destinations, hotel pages, availability and the wishlist. */
export const discoveryApi = {
  search: (params, { signal } = {}) => api.get('/hotels/search', { params, signal }).then((r) => r.data),
  suggestDestinations: (q, { signal } = {}) => api.get('/destinations/search', { params: { q }, signal }).then((r) => r.data.items),
  popularDestinations: (params) => api.get('/destinations/popular', { params }).then((r) => r.data.items),
  stats: () => api.get('/destinations/stats').then((r) => r.data),
  featuredHotels: () => api.get('/hotels', { params: { limit: 6 } }).then((r) => r.data.items),
  hotel: (ref, { signal } = {}) => api.get(`/hotels/${encodeURIComponent(ref)}`, { signal }).then((r) => r.data.hotel),
  availability: (ref, params, { signal } = {}) => api.get(`/hotels/${encodeURIComponent(ref)}/availability`, { params, signal }).then((r) => r.data),
  wishlist: () => api.get('/wishlist').then((r) => r.data.items),
  addWishlist: (hotelId) => api.post('/wishlist', { hotelId }).then((r) => r.data),
  removeWishlist: (hotelId) => api.delete(`/wishlist/${hotelId}`),
};

/** Customer booking flow: holds, guest details, the booking itself, My Trips and cancellation. */
export const bookingApi = {
  createHold: (input) => api.post('/booking/holds', input).then((r) => r.data.hold),
  activeHold: () => api.get('/booking/holds/active').then((r) => r.data.hold),
  hold: (id) => api.get(`/booking/holds/${id}`).then((r) => r.data.hold),
  saveGuests: (id, body) => api.put(`/booking/holds/${id}/guests`, body).then((r) => r.data.hold),
  requote: (id) => api.post(`/booking/holds/${id}/requote`).then((r) => r.data),
  release: (id) => api.post(`/booking/holds/${id}/release`).then((r) => r.data.hold),
  booking: (id) => api.get(`/bookings/${id}`).then((r) => r.data.booking),
  cancellationPreview: (id) => api.get(`/bookings/${id}/cancellation-preview`).then((r) => r.data.preview),
  cancel: (id, body = {}) => api.post(`/bookings/${id}/cancel`, body).then((r) => r.data.booking),
  myTrips: (tab) => api.get('/my-bookings', { params: { tab } }).then((r) => r.data),
  myBooking: (id) => api.get(`/my-bookings/${id}`).then((r) => r.data.booking),
};

/** Customer reviews: eligibility, create/edit/delete a review, and the hotel's public review list. */
export const reviewApi = {
  hotelReviews: (ref, params) => api.get(`/hotels/${encodeURIComponent(ref)}/reviews`, { params }).then((r) => r.data),
  eligibility: (bookingId) => api.get(`/reviews/eligibility/${bookingId}`).then((r) => r.data),
  create: (body) => api.post('/reviews', body).then((r) => r.data.review),
  update: (id, body) => api.put(`/reviews/${id}`, body).then((r) => r.data.review),
  remove: (id) => api.delete(`/reviews/${id}`),
  mine: () => api.get('/reviews/my').then((r) => r.data.reviews),
};

/** Payments. Only the public key id ever comes back from the server; the amount is always the server's. */
export const paymentApi = {
  config: () => api.get('/payments/config').then((r) => r.data),
  createOrder: (holdId) => api.post('/payments/create-order', { holdId }).then((r) => r.data),
  verify: (payload) => api.post('/payments/verify', payload).then((r) => r.data),
  failed: (razorpayOrderId, reason) => api.post('/payments/failed', { razorpayOrderId, reason }).then((r) => r.data),
  devCheckout: (razorpayOrderId, outcome) => api.post('/payments/dev/checkout', { razorpayOrderId, outcome }).then((r) => r.data),
};
