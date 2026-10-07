import crypto from 'node:crypto';
import { AppError } from '../utils/AppError.js';

/**
 * Development-only gateway for when no Razorpay test keys are configured. It produces orders, payments and
 * signatures with the same shapes and the same verification rules as Razorpay, so the rest of the booking
 * flow is exercised end to end. Every response is labelled SIMULATED and the gateway refuses to run in production.
 *
 * It is NOT a payment provider: no money moves. The secret below is public and must never be used for live data.
 */
const SIMULATED_SECRET = 'gokaasa-simulated-gateway-dev-only';

export function createSimulatedGateway() {
  const orders = new Map(); // orderId -> { amountMinor, currency }
  const payments = new Map(); // paymentId -> { orderId, amountMinor, currency }

  const sign = (orderId, paymentId) =>
    crypto.createHmac('sha256', SIMULATED_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

  return {
    mode: 'SIMULATED',
    provider: 'RAZORPAY',
    publicKeyId: 'simulated',
    simulated: true,

    async createOrder({ amountMinor, currency, receipt }) {
      const id = `order_SIM${crypto.randomBytes(8).toString('hex')}`;
      orders.set(id, { amountMinor, currency, receipt });
      return { id, amount: amountMinor, currency };
    },

    /** Called by the dev checkout endpoint once the simulated guest "pays". Returns what Checkout would return. */
    capture(orderId) {
      const order = orders.get(orderId);
      if (!order) throw AppError.notFound('Simulated order not found. Start the payment again.');
      const paymentId = `pay_SIM${crypto.randomBytes(8).toString('hex')}`;
      payments.set(paymentId, { orderId, amountMinor: order.amountMinor, currency: order.currency });
      return {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: sign(orderId, paymentId),
      };
    },

    async fetchPayment(paymentId) {
      const payment = payments.get(paymentId);
      if (!payment) throw AppError.notFound('Simulated payment not found');
      return { id: paymentId, status: 'captured', amount: payment.amountMinor, currency: payment.currency, order_id: payment.orderId, method: 'simulated' };
    },

    async refund({ paymentId, amountMinor }) {
      if (!payments.has(paymentId)) throw AppError.notFound('Simulated payment not found');
      return { id: `rfnd_SIM${crypto.randomBytes(8).toString('hex')}`, status: 'processed', amount: amountMinor };
    },

    verifyPaymentSignature({ orderId, paymentId, signature }) {
      const expected = sign(orderId, paymentId);
      return expected.length === String(signature).length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
    },

    verifyWebhookSignature() {
      return false;
    },
  };
}
