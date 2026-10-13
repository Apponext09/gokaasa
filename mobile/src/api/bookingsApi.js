import { api } from './client.js';

/** Holds, guest details, the booking itself, My Trips, cancellation, invoice -- mirrors the website's
 * bookingApi exactly. The backend remains authoritative for availability, price, and status at every step. */
export const bookingsApi = {
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
  /** The PDF is generated server-side from the booking's own stored snapshot, never recomputed from
   * today's rates -- mirrors the website's bookingApi.invoiceBlob exactly, just as an ArrayBuffer (React
   * Native's axios adapter has no `responseType: 'blob'`; 'arraybuffer' is the RN-supported equivalent). */
  invoice: (id) => api.get(`/bookings/${id}/invoice`, { responseType: 'arraybuffer' }).then((r) => r.data),
};
