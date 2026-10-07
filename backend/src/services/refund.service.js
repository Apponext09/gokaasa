import { withTransaction } from '../db/pool.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { getGateway } from '../payments/index.js';
import { BOOKING_STATUS, assertTransition } from '../domain/bookingStatus.js';
import { REFUND_STATUS, canTransitionRefund } from '../domain/refundStatus.js';
import { PAYMENT_STATUS } from '../domain/paymentStatus.js';
import { auditService } from './audit.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('refund');

/**
 * Moves a refund through the gateway. Safe to call again: a refund that succeeded is returned unchanged, and
 * the gateway is only called after the row has moved to PROCESSING under lock, so two callers cannot both
 * send the money back.
 *
 * Failure leaves the refund FAILED and the booking in REFUND_PENDING, so it can be retried; nothing is
 * marked refunded that the gateway did not confirm.
 */
export async function processRefund(refundId) {
  const claim = await withTransaction(async (client) => {
    const refund = await paymentRepository.lockRefund(refundId, client);
    if (!refund) return null;
    if (refund.status === REFUND_STATUS.SUCCESS) return { done: true };
    if (refund.status === REFUND_STATUS.PROCESSING) return { busy: true };
    if (!canTransitionRefund(refund.status, REFUND_STATUS.PROCESSING)) return { busy: true };
    await paymentRepository.updateRefund(client, refund.id, REFUND_STATUS.PROCESSING);
    const payment = await client.query(`SELECT provider_payment_id FROM payments WHERE id = $1`, [refund.payment_id]);
    return { refund, providerPaymentId: payment.rows[0].provider_payment_id };
  });

  if (!claim || claim.done) return claim?.done ? 'SUCCESS' : 'NOT_FOUND';
  if (claim.busy) return 'PROCESSING';

  let providerRefund;
  try {
    providerRefund = await getGateway().refund({
      paymentId: claim.providerPaymentId,
      amountMinor: Number(claim.refund.amount_minor),
      receipt: `refund-${claim.refund.id}`,
    });
  } catch (error) {
    log.error('refund failed at gateway', { refundId, message: error.message });
    await withTransaction(async (client) => {
      await paymentRepository.updateRefund(client, refundId, REFUND_STATUS.FAILED, { reason: `GATEWAY: ${error.message}`.slice(0, 200) });
    });
    return 'FAILED';
  }

  await withTransaction(async (client) => {
    const refund = await paymentRepository.lockRefund(refundId, client);
    await paymentRepository.updateRefund(client, refundId, REFUND_STATUS.SUCCESS, { provider_refund_id: providerRefund.id });

    const booking = await bookingRepository.lockBooking(refund.booking_id, client);
    if (booking.status === BOOKING_STATUS.REFUND_PENDING) {
      assertTransition(booking.status, BOOKING_STATUS.REFUNDED);
      await bookingRepository.setBookingStatus(client, booking.id, BOOKING_STATUS.REFUNDED, {
        refunded_minor: Number(booking.refunded_minor) + Number(refund.amount_minor),
      });
    }
    await paymentRepository.updatePayment(client, refund.payment_id, PAYMENT_STATUS.REFUNDED);
    await auditService.record(client, {
      actor: null,
      action: 'booking.refunded',
      entity: 'booking',
      entityId: booking.id,
      newValue: { refundId, amountMinor: Number(refund.amount_minor) },
    });
  });
  log.info('refund succeeded', { refundId });
  return 'SUCCESS';
}
