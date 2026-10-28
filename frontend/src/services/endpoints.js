import { api } from './api.js';

/** Thin, typed-by-convention wrappers. Components never build URLs by hand. */
export const authApi = {
  register: (body) => api.post('/auth/register', body).then((r) => r.data),
  login: (body) => api.post('/auth/login', body).then((r) => r.data),
  guestCheckout: (body) => api.post('/auth/guest-checkout', body).then((r) => r.data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me').then((r) => r.data.user),
  forgotPassword: (body) => api.post('/auth/forgot-password', body).then((r) => r.data),
  resetPassword: (body) => api.post('/auth/reset-password', body).then((r) => r.data),
};

/** Self-service hotel-partner registration, OTP verification and document upload. */
export const partnerApi = {
  register: (body) => api.post('/partner/register', body).then((r) => r.data),
  resendOtp: (body) => api.post('/partner/resend-otp', body).then((r) => r.data),
  verifyOtp: (body) => api.post('/partner/verify-otp', body).then((r) => r.data),
  getApplication: () => api.get('/partner/application').then((r) => r.data.application),
  submit: () => api.post('/partner/application/submit').then((r) => r.data.application),
  uploadDocument: (file, docType, onProgress) => {
    const form = new FormData();
    form.append('document', file);
    form.append('docType', docType);
    return api
      .post('/partner/documents', form, {
        onUploadProgress: (event) => onProgress?.(event.total ? Math.round((event.loaded / event.total) * 100) : null),
      })
      .then((r) => r.data.document);
  },
  documentBlob: (docId) => api.get(`/partner/documents/${docId}/file`, { responseType: 'blob' }).then((r) => r.data),
};

export const hotelApi = {
  listPublic: (params) => api.get('/hotels', { params }).then((r) => r.data),
  getPublic: (idOrSlug) => api.get(`/hotels/${encodeURIComponent(idOrSlug)}`).then((r) => r.data.hotel),
  amenities: () => api.get('/amenities').then((r) => r.data.amenities),
};

export const catalogApi = {
  list: (kind) => api.get(`/catalogs/${kind}`).then((r) => r.data.items),
  adminList: (kind) => api.get(`/admin/catalogs/${kind}`).then((r) => r.data.items),
  create: (kind, body) => api.post(`/admin/catalogs/${kind}`, body).then((r) => r.data.item),
  update: (kind, code, body) => api.patch(`/admin/catalogs/${kind}/${encodeURIComponent(code)}`, body).then((r) => r.data.item),
};

export const adminApi = {
  dashboard: () => api.get('/admin/dashboard/summary').then((r) => r.data),
  dashboardTrends: (params) => api.get('/admin/dashboard/trends', { params }).then((r) => r.data),
  listHotels: (params) => api.get('/admin/hotels', { params }).then((r) => r.data),
  hotelLookup: () => api.get('/admin/lookups/hotels').then((r) => r.data.hotels),
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
  replaceImage: (id, imageId, file, onProgress) => {
    const form = new FormData();
    form.append('image', file);
    return api
      .post(`/admin/hotels/${id}/images/${imageId}/replace`, form, {
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
  getManager: (userId) => api.get(`/admin/managers/${userId}`).then((r) => r.data.manager),
  listOnboardingExecutives: () => api.get('/admin/onboarding-executives').then((r) => r.data.executives),
  listOnboardingForHotel: (id) => api.get(`/admin/hotels/${id}/onboarding-executives`).then((r) => r.data.executives),
  assignOnboardingExecutive: (id, userId) => api.post(`/admin/hotels/${id}/onboarding-executives`, { userId }).then((r) => r.data.executives),
  unassignOnboardingExecutive: (id, userId) => api.delete(`/admin/hotels/${id}/onboarding-executives/${userId}`).then((r) => r.data.executives),

  // Bookings, payments, refunds (platform-wide, scoped server-side for a hotel manager)
  listBookings: (params) => api.get('/admin/bookings', { params }).then((r) => r.data),
  getBooking: (id) => api.get(`/admin/bookings/${id}`).then((r) => r.data.booking),
  cancelBooking: (id, body) => api.post(`/admin/bookings/${id}/cancel`, body).then((r) => r.data.booking),
  invoiceBlob: (id) => api.get(`/admin/bookings/${id}/invoice`, { responseType: 'blob' }).then((r) => r.data),
  listPayments: (params) => api.get('/admin/payments', { params }).then((r) => r.data),
  listRefunds: (params) => api.get('/admin/refunds', { params }).then((r) => r.data),

  // Customers
  listCustomers: (params) => api.get('/admin/customers', { params }).then((r) => r.data),
  getCustomer: (id) => api.get(`/admin/customers/${id}`).then((r) => r.data.customer),
  setCustomerStatus: (id, isActive) => api.patch(`/admin/customers/${id}/status`, { isActive }).then((r) => r.data.customer),

  // User Management: a unified, presence-aware directory across every role. ADMIN only (the backend enforces this).
  listUsers: (params) => api.get('/admin/users', { params }).then((r) => r.data),
  createStaff: (body) => api.post('/admin/users/staff', body).then((r) => r.data.user),
  getUser: (id) => api.get(`/admin/users/${id}`).then((r) => r.data.user),
  getUserKpis: () => api.get('/admin/users/kpis').then((r) => r.data),
  setUserStatus: (id, isActive) => api.patch(`/admin/users/${id}/status`, { isActive }).then((r) => r.data.user),
  forceSignOutUser: (id) => api.post(`/admin/users/${id}/force-signout`).then((r) => r.data),
  revokeUserSession: (id, sessionId) => api.delete(`/admin/users/${id}/sessions/${sessionId}`).then((r) => r.data),
  issueUserStreamTicket: () => api.post('/admin/users/stream-ticket').then((r) => r.data),

  // Audit log (ADMIN only; the backend enforces this)
  listAuditLogs: (params) => api.get('/admin/audit-logs', { params }).then((r) => r.data),

  // Reviews moderation (ADMIN sees every hotel; a HOTEL_MANAGER is scoped server-side to their own)
  listReviews: (params) => api.get('/admin/reviews', { params }).then((r) => r.data),
  moderateReview: (id, action, reason) => api.post(`/admin/reviews/${id}/moderate`, { action, reason }).then((r) => r.data.review),

  // Global search (command palette) and operational reports
  search: (q, { signal } = {}) => api.get('/admin/search', { params: { q }, signal }).then((r) => r.data.items),
  hotelPerformance: (params) => api.get('/admin/reports/hotel-performance', { params }).then((r) => r.data),
  dashboardAlerts: () => api.get('/admin/dashboard/alerts').then((r) => r.data.alerts),

  // CSV exports -- each returns a Blob the caller saves as a file; same filters as the matching list endpoint.
  exportCsv: (entity, params) => api.get(`/admin/exports/${entity}`, { params, responseType: 'blob' }).then((r) => r.data),

  // Settings (ADMIN can write; HOTEL_MANAGER can read)
  getSettings: () => api.get('/admin/settings').then((r) => r.data),
  updateSettings: (body) => api.patch('/admin/settings', body).then((r) => r.data),

  // Coupons / offers (ADMIN only)
  listCoupons: (params) => api.get('/admin/coupons', { params }).then((r) => r.data),
  getCoupon: (id) => api.get(`/admin/coupons/${id}`).then((r) => r.data.coupon),
  createCoupon: (body) => api.post('/admin/coupons', body).then((r) => r.data.coupon),
  updateCoupon: (id, body) => api.patch(`/admin/coupons/${id}`, body).then((r) => r.data.coupon),
  uploadCouponImage: (id, file, onProgress) => {
    const form = new FormData();
    form.append('image', file);
    return api
      .post(`/admin/coupons/${id}/image`, form, {
        onUploadProgress: (event) => onProgress?.(event.total ? Math.round((event.loaded / event.total) * 100) : null),
      })
      .then((r) => r.data.coupon);
  },
  setCouponStatus: (id, isActive) => api.patch(`/admin/coupons/${id}/status`, { isActive }).then((r) => r.data.coupon),
  deleteCoupon: (id) => api.delete(`/admin/coupons/${id}`),

  // Partner (HOTEL_OWNER) application review queue (ADMIN only; the backend enforces this)
  listPartnerApplications: (params) => api.get('/admin/partners', { params }).then((r) => r.data),
  getPartnerApplication: (userId) => api.get(`/admin/partners/${userId}`).then((r) => r.data.application),
  approvePartnerApplication: (userId) => api.post(`/admin/partners/${userId}/approve`).then((r) => r.data.application),
  rejectPartnerApplication: (userId, reason) => api.post(`/admin/partners/${userId}/reject`, { reason }).then((r) => r.data.application),
  partnerDocumentBlob: (userId, docId) => api.get(`/admin/partners/${userId}/documents/${docId}/file`, { responseType: 'blob' }).then((r) => r.data),
};

/** Room inventory: room types, room images, rate plans, cancellation policies, calendar and blocks. */
export const roomApi = {
  list: (hotelId, includeArchived = false) =>
    api.get(`/admin/hotels/${hotelId}/room-types`, { params: { includeArchived } }).then((r) => r.data.roomTypes),
  nextCode: (hotelId) => api.get(`/admin/hotels/${hotelId}/room-types/next-code`).then((r) => r.data.roomCode),
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
  replaceImage: (roomId, imageId, file, onProgress) => {
    const form = new FormData();
    form.append('image', file);
    return api
      .post(`/admin/room-types/${roomId}/images/${imageId}/replace`, form, {
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
  stayTypes: (params) => api.get('/destinations/stay-types', { params }).then((r) => r.data.items),
  stats: () => api.get('/destinations/stats').then((r) => r.data),
  featuredHotels: () => api.get('/hotels', { params: { limit: 6 } }).then((r) => r.data.items),
  nearbyHotels: (params, { signal } = {}) => api.get('/hotels/nearby', { params, signal }).then((r) => r.data),
  handpickedHotels: (params) => api.get('/hotels/handpicked', { params }).then((r) => r.data),
  subscribeNewsletter: (email) => api.post('/newsletter/subscribe', { email }).then((r) => r.data),
  hotel: (ref, { signal } = {}) => api.get(`/hotels/${encodeURIComponent(ref)}`, { signal }).then((r) => r.data.hotel),
  availability: (ref, params, { signal } = {}) => api.get(`/hotels/${encodeURIComponent(ref)}/availability`, { params, signal }).then((r) => r.data),
  wishlist: () => api.get('/wishlist').then((r) => r.data.items),
  addWishlist: (hotelId) => api.post('/wishlist', { hotelId }).then((r) => r.data),
  removeWishlist: (hotelId) => api.delete(`/wishlist/${hotelId}`),
};

/** Public offer/coupon discovery -- no auth required, nothing customer-specific. */
export const offerApi = {
  list: () => api.get('/offers').then((r) => r.data.items),
};

/** Mode B: the AI natural-language assistant. Public -- no auth needed, same as search itself. */
export const assistantApi = {
  status: () => api.get('/assistant/status').then((r) => r.data),
  extract: (message) => api.post('/assistant/extract', { message }).then((r) => r.data),
};

/** Authenticated presence: one call each to open, heartbeat and close this tab's session. Identity always comes from the access token, never from a client-supplied user id. */
export const presenceApi = {
  start: (body) => api.post('/presence/session', body).then((r) => r.data.session),
  heartbeat: (body) => api.post('/presence/heartbeat', body).then((r) => r.data),
  end: (body) => api.post('/presence/session/end', body).then((r) => r.data),
};

/** Customer booking flow: holds, guest details, the booking itself, My Trips and cancellation. */
export const bookingApi = {
  createHold: (input) => api.post('/booking/holds', input).then((r) => r.data.hold),
  activeHold: () => api.get('/booking/holds/active').then((r) => r.data.hold),
  hold: (id) => api.get(`/booking/holds/${id}`).then((r) => r.data.hold),
  saveGuests: (id, body) => api.put(`/booking/holds/${id}/guests`, body).then((r) => r.data.hold),
  requote: (id) => api.post(`/booking/holds/${id}/requote`).then((r) => r.data),
  release: (id) => api.post(`/booking/holds/${id}/release`).then((r) => r.data.hold),
  holdCoupons: (id) => api.get(`/booking/holds/${id}/coupons`).then((r) => r.data.items),
  applyCoupon: (id, code) => api.post(`/booking/holds/${id}/coupon`, { code }).then((r) => r.data.hold),
  removeCoupon: (id) => api.delete(`/booking/holds/${id}/coupon`).then((r) => r.data.hold),
  booking: (id) => api.get(`/bookings/${id}`).then((r) => r.data.booking),
  cancellationPreview: (id) => api.get(`/bookings/${id}/cancellation-preview`).then((r) => r.data.preview),
  cancel: (id, body = {}) => api.post(`/bookings/${id}/cancel`, body).then((r) => r.data.booking),
  myTrips: (tab) => api.get('/my-bookings', { params: { tab } }).then((r) => r.data),
  myBooking: (id) => api.get(`/my-bookings/${id}`).then((r) => r.data.booking),
  /** The PDF is generated server-side from the booking's own stored snapshot, never recomputed from today's rates. */
  invoiceBlob: (id) => api.get(`/bookings/${id}/invoice`, { responseType: 'blob' }).then((r) => r.data),
};

/** Notifications: the bell/dropdown's data, always scoped to the signed-in user by the server. */
export const notificationApi = {
  list: (params) => api.get('/notifications', { params }).then((r) => r.data),
  unreadCount: () => api.get('/notifications/unread-count').then((r) => r.data.count),
  markRead: (id) => api.patch(`/notifications/${id}/read`).then((r) => r.data.notification),
  markAllRead: () => api.patch('/notifications/read-all').then((r) => r.data),
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
