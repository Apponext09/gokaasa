import crypto from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('payments');
const API_BASE = 'https://api.razorpay.com/v1';
const TIMEOUT_MS = 10_000;

/** Constant-time comparison of two hex strings. Length mismatch is a plain mismatch. */
export function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/**
 * Razorpay REST adapter. The key secret only ever leaves this process in the Authorization header over TLS.
 * Errors are reported with Razorpay's description, never with the request body or credentials.
 */
export function createRazorpayGateway({ keyId, keySecret, webhookSecret, fetchImpl = fetch }) {
  const mode = keyId.startsWith('rzp_live_') ? 'LIVE' : 'TEST';
  const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

  async function call(method, path, body) {
    let response;
    try {
      response = await fetchImpl(`${API_BASE}${path}`, {
        method,
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      log.error('razorpay request failed', { method, path: path.split('/').slice(0, 3).join('/'), reason: error.name });
      throw AppError.serviceUnavailable('The payment provider could not be reached. Please try again.');
    }
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      log.warn('razorpay refused request', { method, status: response.status, code: json?.error?.code });
      throw AppError.serviceUnavailable(json?.error?.description ?? 'The payment provider refused the request.');
    }
    return json;
  }

  return {
    mode,
    provider: 'RAZORPAY',
    /** Only the public key id is ever shared with the browser. */
    publicKeyId: keyId,
    simulated: false,

    async createOrder({ amountMinor, currency, receipt, notes }) {
      const order = await call('POST', '/orders', { amount: amountMinor, currency, receipt, notes, payment_capture: 1 });
      return { id: order.id, amount: order.amount, currency: order.currency };
    },

    /** Fetches the payment from Razorpay so the amount and status are never taken from the browser. */
    async fetchPayment(paymentId) {
      return call('GET', `/payments/${encodeURIComponent(paymentId)}`);
    },

    async refund({ paymentId, amountMinor, receipt }) {
      const refund = await call('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, {
        amount: amountMinor,
        speed: 'normal',
        receipt,
      });
      return { id: refund.id, status: refund.status };
    },

    /** Checkout signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
    verifyPaymentSignature({ orderId, paymentId, signature }) {
      const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
      return safeEqualHex(expected, signature);
    },

    /** Webhook signature: HMAC-SHA256 of the raw request body with the webhook secret. */
    verifyWebhookSignature(rawBody, signature) {
      if (!webhookSecret) return false;
      const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      return safeEqualHex(expected, signature);
    },
  };
}
