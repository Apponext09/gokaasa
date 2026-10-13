import { api } from './client.js';

/**
 * Only the public Razorpay key id (never the secret) and amounts the SERVER computed ever reach this
 * client. /payments/config reports `simulated: true` whenever no real Razorpay keys are configured on the
 * backend (the current state of backend/.env in this environment) -- in that case the dev/test payment
 * flow below (devCheckout) is used instead of real Razorpay, exactly as the website itself does.
 */
export const paymentsApi = {
  config: () => api.get('/payments/config').then((r) => r.data),
  createOrder: (holdId) => api.post('/payments/create-order', { holdId }).then((r) => r.data),
  verify: (payload) => api.post('/payments/verify', payload).then((r) => r.data),
  failed: (razorpayOrderId, reason) => api.post('/payments/failed', { razorpayOrderId, reason }).then((r) => r.data),
  /** Dev/test-only simulated gateway -- still goes through the server's own signature check, never a
   * client-side "it worked" shortcut. Refused by the backend outside development. */
  devCheckout: (razorpayOrderId, outcome) => api.post('/payments/dev/checkout', { razorpayOrderId, outcome }).then((r) => r.data),
};
