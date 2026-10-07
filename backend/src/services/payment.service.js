import crypto from 'node:crypto';
import { withTransaction } from '../db/pool.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { getGateway } from '../payments/index.js';
import { config } from '../config/index.js';
import { ensureBookingForHold, buildBookingDto } from './booking.service.js';
import { quoteStay } from './quote.service.js';
import { processRefund } from './refund.service.js';
import { closeHoldInTx, HOLD_EXPIRED_MESSAGE, requireOwnedHold } from './hold.service.js';
import { notificationService } from '../notifications/notificationService.js';
import { auditService } from './audit.service.js';
import { HOLD_STATUS, isHoldLive } from '../domain/holdStatus.js';
import { BOOKING_STATUS, assertTransition, canTransition } from '../domain/bookingStatus.js';
import { PAYMENT_STATUS, canTransitionPayment, OPEN_PAYMENT_STATUSES } from '../domain/paymentStatus.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('payment');
const CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

/** Keys the webhook payload may contain that are never stored, even though Razorpay sends them. */
const SENSITIVE_PAYLOAD_KEYS = ['card', 'card_id', 'token_id', 'vpa', 'email', 'contact', 'bank', 'wallet', 'upi'];

function sanitizeEvent(event) {
  const strip = (entity) => {
    if (!entity || typeof entity !== 'object') return entity;
    return Object.fromEntries(Object.entries(entity).filter(([key]) => !SENSITIVE_PAYLOAD_KEYS.includes(key)));
  };
  const payload = event.payload ?? {};
  return {
    event: event.event,
    created_at: event.created_at,
    payment: strip(payload.payment?.entity),
    order: strip(payload.order?.entity),
  };
}

/** Writes a payment's success. Only non-sensitive fields from the provider are kept. */
function successFields(paymentId, providerPayment) {
  return {
    provider_payment_id: paymentId,
    paid_at: new Date(),
    provider_payload: JSON.stringify({ id: paymentId, method: providerPayment?.method ?? null, status: 'captured' }),
  };
}

/**
 * Settles one payment against its booking. Used by verify, by the webhook, and by the simulated checkout, so
 * every route to CONFIRMED runs the same checks. The caller has already verified the provider signature.
 *
 * Lock order is hold, then booking, then payment, the same order every other path uses, so the paths cannot deadlock.
 */
async function settlePayment({ orderId, paymentId, amountMinor, currency, providerPayment, source }) {
  const peek = await paymentRepository.findByOrder(orderId);
  if (!peek) return { kind: 'UNKNOWN_ORDER' };

  const result = await withTransaction(async (client) => {
    const peekBooking = await bookingRepository.findBooking(peek.booking_id, client);
    const hold = peekBooking.hold_id ? await bookingRepository.lockHold(peekBooking.hold_id, client) : null;
    const booking = await bookingRepository.lockBooking(peekBooking.id, client);
    const payment = await paymentRepository.lockByOrder(orderId, client);

    if (Number(payment.amount_minor) !== Number(amountMinor) || payment.currency !== currency) {
      log.error('payment amount or currency mismatch', { bookingRef: booking.booking_ref, source });
      return { kind: 'MISMATCH' };
    }

    if (payment.status === PAYMENT_STATUS.SUCCESS && payment.provider_payment_id === paymentId) {
      return { kind: 'ALREADY_CONFIRMED', bookingId: booking.id };
    }

    // A second successful payment for a booking that already has one is refunded, never kept.
    const existing = await paymentRepository.findSuccessfulForBooking(booking.id, client);
    if (existing && existing.provider_payment_id !== paymentId) {
      log.warn('duplicate payment received', { bookingRef: booking.booking_ref, source });
      return { kind: 'DUPLICATE', bookingId: booking.id, paymentId, amountMinor: Number(amountMinor) };
    }

    if (!canTransitionPayment(payment.status, PAYMENT_STATUS.SUCCESS)) {
      throw new Error(`Unexpected payment state ${payment.status} for settlement`);
    }
    const holdLive = Boolean(hold) && isHoldLive(hold) && booking.status === BOOKING_STATUS.PAYMENT_PENDING;

    if (holdLive) {
      await paymentRepository.updatePayment(client, payment.id, PAYMENT_STATUS.SUCCESS, successFields(paymentId, providerPayment));
      assertTransition(booking.status, BOOKING_STATUS.PAID);
      await bookingRepository.setBookingStatus(client, booking.id, BOOKING_STATUS.PAID, { paid_minor: Number(amountMinor) });
      assertTransition(BOOKING_STATUS.PAID, BOOKING_STATUS.CONFIRMED);
      await bookingRepository.setBookingStatus(client, booking.id, BOOKING_STATUS.CONFIRMED);
      await bookingRepository.setHoldStatus(client, hold.id, HOLD_STATUS.CONVERTED);
      await bookingRepository.setReservationsForHold(client, hold.id, 'CONFIRMED', booking.id);
      await auditService.record(client, {
        actor: null,
        action: 'booking.confirmed',
        entity: 'booking',
        entityId: booking.id,
        newValue: { paymentId, amountMinor: Number(amountMinor), source },
      });
      return { kind: 'CONFIRMED', bookingId: booking.id, bookingRef: booking.booking_ref };
    }

    // The money arrived after the hold ended. The booking can no longer be confirmed, so the payment is
    // recorded as captured and refunded in full. Nothing is confirmed.
    if (hold && hold.status === HOLD_STATUS.HELD) {
      await closeHoldInTx(client, hold, { holdStatus: HOLD_STATUS.EXPIRED, bookingStatus: BOOKING_STATUS.EXPIRED, reason: 'HOLD_EXPIRED' });
    }
    const current = await bookingRepository.findBooking(booking.id, client);
    if (!canTransition(current.status, BOOKING_STATUS.REFUND_PENDING)) {
      throw new Error(`Booking ${current.booking_ref} cannot be refunded from ${current.status}`);
    }
    await paymentRepository.updatePayment(client, payment.id, PAYMENT_STATUS.SUCCESS, successFields(paymentId, providerPayment));
    // REFUND_PENDING always carries a cancellation time (schema rule); here the system ended the booking.
    await bookingRepository.setBookingStatus(client, booking.id, BOOKING_STATUS.REFUND_PENDING, {
      paid_minor: Number(amountMinor),
      cancelled_at: new Date(),
      cancellation_reason: 'PAYMENT_AFTER_HOLD_ENDED',
    });
    const refundId = await paymentRepository.insertRefund(client, {
      paymentId: payment.id,
      bookingId: booking.id,
      amountMinor: Number(amountMinor),
      reason: 'PAYMENT_AFTER_HOLD_ENDED',
      idempotencyKey: `late:${paymentId}`,
    });
    return { kind: 'REFUND_REQUIRED', bookingId: booking.id, refundId };
  });

  return result;
}

/** Acts on a settlement result after its transaction has committed. Gateway calls happen only here. */
async function afterSettle(result) {
  if (result.kind === 'REFUND_REQUIRED') {
    await processRefund(result.refundId);
  }
  if (result.kind === 'DUPLICATE') {
    try {
      await getGateway().refund({ paymentId: result.paymentId, amountMinor: result.amountMinor, receipt: `duplicate-${result.paymentId}` });
      log.warn('duplicate payment refunded', { bookingId: result.bookingId, paymentId: result.paymentId });
    } catch (error) {
      log.error('duplicate payment refund failed', { paymentId: result.paymentId, message: error.message });
    }
  }
  if (result.kind === 'CONFIRMED') {
    const booking = await bookingRepository.findBooking(result.bookingId);
    await notificationService.sendBookingConfirmation(booking).catch((error) => log.error('confirmation notice failed', { message: error.message }));
    log.info('booking confirmed', { bookingRef: result.bookingRef });
  }
}

/** Records a failed or abandoned attempt. The booking and hold stay as they are: the guest may retry. */
async function recordFailure({ orderId, reason, userId = null }) {
  const peek = await paymentRepository.findByOrder(orderId);
  if (!peek) return null;
  const peekBooking = await bookingRepository.findBooking(peek.booking_id);
  if (userId !== null && peekBooking.user_id !== userId) throw AppError.notFound('Payment not found');

  return withTransaction(async (client) => {
    const booking = await bookingRepository.lockBooking(peekBooking.id, client);
    const payment = await paymentRepository.lockByOrder(orderId, client);
    if (OPEN_PAYMENT_STATUSES.includes(payment.status)) {
      await paymentRepository.updatePayment(client, payment.id, PAYMENT_STATUS.FAILED, {
        failure_reason: String(reason ?? 'PAYMENT_FAILED').slice(0, 200),
      });
    }
    return booking.id;
  });
}

async function ownedPaymentOrThrow(userId, orderId) {
  const payment = await paymentRepository.findByOrder(orderId);
  if (!payment) throw AppError.notFound('Payment not found');
  const booking = await bookingRepository.findBooking(payment.booking_id);
  if (!booking || booking.user_id !== userId) throw AppError.notFound('Payment not found');
  return { payment, booking };
}

export const paymentService = {
  /** What the browser may know about payments: the public key id and where to load Checkout. Never a secret. */
  publicConfig() {
    const gateway = getGateway();
    return {
      provider: gateway.provider,
      mode: gateway.mode,
      simulated: gateway.simulated,
      keyId: gateway.simulated ? null : gateway.publicKeyId,
      checkoutScriptUrl: gateway.simulated ? null : CHECKOUT_SCRIPT_URL,
    };
  },

  /**
   * Starts a payment for a live hold. The amount is the booking's stored total, so nothing the browser sends
   * can change it. If the hold's price changed, the guest is told before any order exists.
   */
  async createOrder(userId, holdId) {
    const gateway = getGateway();

    const step = await withTransaction(async (client) => {
      const hold = await requireOwnedHold(client, userId, holdId);
      if (hold.status === HOLD_STATUS.CONVERTED) return { kind: 'ALREADY_PAID' };
      if (!isHoldLive(hold)) {
        if (hold.status === HOLD_STATUS.HELD) {
          await closeHoldInTx(client, hold, { holdStatus: HOLD_STATUS.EXPIRED, bookingStatus: BOOKING_STATUS.EXPIRED, reason: 'HOLD_EXPIRED' });
        }
        return { kind: 'EXPIRED' };
      }

      if (!hold.booking_id) {
        // First payment attempt: re-price now. Once a booking exists its snapshot is fixed.
        const quote = await quoteStay(client, {
          hotelId: Number(hold.hotel_id),
          roomTypeId: Number(hold.room_type_id),
          ratePlanId: Number(hold.rate_plan_id),
          checkIn: hold.check_in,
          checkOut: hold.check_out,
          rooms: hold.rooms,
          occupancy: hold.occupancy,
        }, { checkAvailability: false });
        // The new price is reported but not stored here: the guest must accept it with an explicit re-quote.
        if (quote.total !== Number(hold.total_minor)) {
          return { kind: 'PRICE_CHANGED', previousTotal: Number(hold.total_minor), total: quote.total };
        }
      }

      const booking = hold.booking_id
        ? await bookingRepository.lockBooking(hold.booking_id, client)
        : await ensureBookingForHold(client, hold);
      if (booking.status !== BOOKING_STATUS.PAYMENT_PENDING) {
        return { kind: 'NOT_PAYABLE', status: booking.status };
      }
      const open = await paymentRepository.openPaymentForBooking(client, booking.id);
      return {
        kind: 'READY',
        booking,
        hold,
        open,
        attempt: open ? open.attempt : await paymentRepository.nextAttempt(client, booking.id),
      };
    });

    if (step.kind === 'ALREADY_PAID') throw AppError.conflict('This booking is already paid and confirmed.', { code: 'ALREADY_PAID' });
    if (step.kind === 'EXPIRED') throw AppError.conflict(HOLD_EXPIRED_MESSAGE, { code: 'HOLD_EXPIRED' });
    if (step.kind === 'PRICE_CHANGED') {
      throw AppError.conflict('The price for your stay has changed. Review the new total to continue.', {
        code: 'PRICE_CHANGED',
        previousTotal: step.previousTotal,
        total: step.total,
      });
    }
    if (step.kind === 'NOT_PAYABLE') throw AppError.conflict('This booking can no longer take payment.', { status: step.status });

    const { booking, hold, open } = step;
    const amountMinor = Number(booking.total_minor);
    const currency = booking.currency;
    if (open) {
      return orderResponse(gateway, { order: { id: open.provider_order_id, amount: Number(open.amount_minor), currency }, booking, hold });
    }

    // The gateway call happens outside the database transaction, so no lock is held during the network round trip.
    const order = await gateway.createOrder({
      amountMinor,
      currency,
      receipt: booking.booking_ref,
      notes: { bookingRef: booking.booking_ref },
    });

    const saved = await withTransaction(async (client) => {
      const lockedHold = await bookingRepository.lockHold(hold.id, client);
      const lockedBooking = await bookingRepository.lockBooking(booking.id, client);
      if (!isHoldLive(lockedHold) || lockedBooking.status !== BOOKING_STATUS.PAYMENT_PENDING) {
        return { kind: 'LOST_RACE' };
      }
      const existing = await paymentRepository.openPaymentForBooking(client, booking.id);
      if (existing) return { kind: 'EXISTING', payment: existing };
      await paymentRepository.insertPayment(client, {
        bookingId: booking.id,
        orderId: order.id,
        amountMinor,
        currency,
        attempt: await paymentRepository.nextAttempt(client, booking.id),
        gatewayMode: gateway.mode,
        receipt: booking.booking_ref,
      });
      return { kind: 'CREATED' };
    });

    if (saved.kind === 'LOST_RACE') throw AppError.conflict(HOLD_EXPIRED_MESSAGE, { code: 'HOLD_EXPIRED' });
    if (saved.kind === 'EXISTING') {
      // Another request created a checkout first. This order is never paid through us, so it is simply left unpaid.
      return orderResponse(gateway, {
        order: { id: saved.payment.provider_order_id, amount: Number(saved.payment.amount_minor), currency },
        booking,
        hold,
      });
    }
    log.info('payment order created', { bookingRef: booking.booking_ref, mode: gateway.mode });
    return orderResponse(gateway, { order: { id: order.id, amount: amountMinor, currency }, booking, hold });
  },

  /**
   * The browser reports a successful Checkout. The browser's claim is never trusted: the signature must match,
   * the payment must exist for this user's booking, and the gateway must report it captured for this amount.
   */
  async verify(userId, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }) {
    const gateway = getGateway();
    if (!gateway.verifyPaymentSignature({ orderId, paymentId, signature })) {
      log.warn('payment signature rejected', { orderId });
      throw AppError.badRequest('We could not verify this payment. If money was deducted, it will be reconciled automatically.', {
        code: 'PAYMENT_SIGNATURE_INVALID',
      });
    }
    await ownedPaymentOrThrow(userId, orderId);

    const providerPayment = await gateway.fetchPayment(paymentId);
    if (providerPayment.order_id !== orderId) {
      throw AppError.badRequest('This payment does not belong to the order.', { code: 'PAYMENT_ORDER_MISMATCH' });
    }
    if (providerPayment.status !== 'captured') {
      throw AppError.conflict('The payment is not complete yet. Please try again in a moment.', { code: 'PAYMENT_NOT_CAPTURED' });
    }

    const result = await settlePayment({
      orderId,
      paymentId,
      amountMinor: providerPayment.amount,
      currency: providerPayment.currency,
      providerPayment,
      source: 'VERIFY',
    });
    await afterSettle(result);
    return this.outcomeResponse(userId, result, orderId);
  },

  async outcomeResponse(userId, result, orderId) {
    if (result.kind === 'MISMATCH') {
      throw AppError.conflict('The payment amount does not match this booking. Our team has been alerted; you will not be charged twice.', {
        code: 'PAYMENT_MISMATCH',
      });
    }
    if (result.kind === 'UNKNOWN_ORDER') throw AppError.notFound('Payment not found');
    if (result.kind === 'REFUND_REQUIRED') {
      throw AppError.conflict('Your room hold ended before the payment was completed, so the payment has been refunded. Please search again.', {
        code: 'HOLD_EXPIRED_REFUNDED',
      });
    }
    const { payment } = await ownedPaymentOrThrow(userId, orderId);
    const booking = await bookingRepository.findBooking(payment.booking_id);
    return { status: 'CONFIRMED', booking: await buildBookingDto(null, booking) };
  },

  /** One payment, owner-scoped via its booking. A payment id for someone else's booking 404s, never 403s. */
  async getById(userId, paymentId) {
    const payment = await paymentRepository.findById(paymentId);
    if (!payment) throw AppError.notFound('Payment not found');
    const booking = await bookingRepository.findBooking(payment.booking_id);
    if (!booking || booking.user_id !== userId) throw AppError.notFound('Payment not found');
    return {
      id: payment.id,
      bookingId: payment.booking_id,
      bookingRef: booking.booking_ref,
      status: payment.status,
      amountMinor: Number(payment.amount_minor),
      currency: payment.currency,
      paidAt: payment.paid_at,
      createdAt: payment.created_at,
    };
  },

  /** One refund, owner-scoped via its booking, the same way a payment is. */
  async getRefundById(userId, refundId) {
    const refund = await paymentRepository.findRefundById(refundId);
    if (!refund) throw AppError.notFound('Refund not found');
    const booking = await bookingRepository.findBooking(refund.booking_id);
    if (!booking || booking.user_id !== userId) throw AppError.notFound('Refund not found');
    return {
      id: refund.id,
      bookingId: refund.booking_id,
      bookingRef: booking.booking_ref,
      paymentId: refund.payment_id,
      amountMinor: Number(refund.amount_minor),
      currency: booking.currency,
      status: refund.status,
      reason: refund.reason,
      createdAt: refund.created_at,
      processedAt: refund.processed_at,
    };
  },

  /** Client-side failure or dismissal. Only moves an open payment to FAILED; the hold stays until it expires. */
  async reportFailure(userId, { razorpayOrderId, reason }) {
    await ownedPaymentOrThrow(userId, razorpayOrderId);
    await recordFailure({ orderId: razorpayOrderId, reason: reason ?? 'CHECKOUT_DISMISSED', userId });
    return { status: 'FAILED', canRetry: true };
  },

  /**
   * Simulated checkout, development only. The server does the capture and signs it with the simulator's key, so
   * the browser receives exactly what Checkout would return and must still pass it through verify.
   */
  async devCheckout(userId, { razorpayOrderId, outcome }) {
    const gateway = getGateway();
    if (!gateway.simulated || config.isProduction) throw AppError.notFound('Not found');
    const { payment } = await ownedPaymentOrThrow(userId, razorpayOrderId);
    if (!OPEN_PAYMENT_STATUSES.includes(payment.status)) {
      throw AppError.conflict('This checkout is already closed. Start a new payment.');
    }
    if (outcome === 'failure') {
      await recordFailure({ orderId: razorpayOrderId, reason: 'SIMULATED_DECLINE', userId });
      return { status: 'FAILED' };
    }
    return gateway.capture(razorpayOrderId);
  },

  /**
   * Razorpay webhook. Signature-checked on the raw body. Each event id is recorded once, so a redelivered
   * event returns immediately; settlement is idempotent, so a repeat can never confirm or refund twice.
   */
  async webhook(rawBody, signature, headerEventId) {
    const gateway = getGateway();
    if (gateway.simulated) throw AppError.notFound('Webhooks are not used in simulated mode');
    if (!gateway.verifyWebhookSignature(rawBody, signature ?? '')) {
      log.warn('webhook signature rejected');
      throw AppError.badRequest('Invalid webhook signature', { code: 'WEBHOOK_SIGNATURE_INVALID' });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw AppError.badRequest('Webhook body is not valid JSON');
    }
    const eventId = headerEventId || crypto.createHash('sha256').update(rawBody).digest('hex');
    const entity = event.payload?.payment?.entity ?? null;
    const orderId = entity?.order_id ?? event.payload?.order?.entity?.id ?? null;

    const recorded = await withTransaction((client) =>
      paymentRepository.recordWebhookEvent(client, {
        eventId,
        eventType: String(event.event ?? 'unknown').slice(0, 80),
        paymentId: entity?.id ?? null,
        orderId,
        payload: sanitizeEvent(event),
      }),
    );
    if (!recorded) {
      const previous = await paymentRepository.findWebhookEvent(eventId);
      if (previous && ['PROCESSED', 'IGNORED'].includes(previous.status)) return { duplicate: true };
    }

    try {
      let status = 'IGNORED';
      if ((event.event === 'payment.captured' || event.event === 'order.paid') && entity) {
        const result = await settlePayment({
          orderId: entity.order_id,
          paymentId: entity.id,
          amountMinor: entity.amount,
          currency: entity.currency,
          providerPayment: entity,
          source: 'WEBHOOK',
        });
        await afterSettle(result);
        status = 'PROCESSED';
      } else if (event.event === 'payment.failed' && entity) {
        await recordFailure({ orderId: entity.order_id, reason: entity.error_description ?? 'PAYMENT_FAILED' });
        status = 'PROCESSED';
      }
      await withTransaction((client) => paymentRepository.setWebhookStatus(client, eventId, status));
      return { duplicate: false, status };
    } catch (error) {
      // Stored as FAILED and answered with a 5xx, so the gateway redelivers it.
      await withTransaction((client) => paymentRepository.setWebhookStatus(client, eventId, 'FAILED')).catch(() => {});
      throw error;
    }
  },
};

function orderResponse(gateway, { order, booking, hold }) {
  const primary = hold.guest_details?.primaryContact ?? {};
  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: gateway.simulated ? null : gateway.publicKeyId,
    simulated: gateway.simulated,
    mode: gateway.mode,
    bookingId: booking.id,
    bookingRef: booking.booking_ref,
    holdId: hold.id,
    expiresAt: hold.expires_at,
    description: `${booking.hotel_name} · ${booking.booking_ref}`,
    prefill: {
      name: [primary.firstName, primary.lastName].filter(Boolean).join(' '),
      email: primary.email ?? '',
      contact: primary.mobile ?? '',
    },
  };
}

export { HOLD_EXPIRED_MESSAGE };
