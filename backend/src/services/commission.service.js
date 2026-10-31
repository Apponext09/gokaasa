import { withTransaction } from '../db/pool.js';
import { commissionConfigRepository } from '../repositories/commissionConfig.repository.js';
import { bookingCommissionRepository } from '../repositories/bookingCommission.repository.js';
import { ledgerEntryRepository } from '../repositories/ledgerEntry.repository.js';
import { LEDGER_ENTRY_TYPE, LEDGER_DIRECTION } from '../domain/ledgerEntry.js';
import { percentOf } from '../utils/money.js';
import { auditService } from './audit.service.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('commission');

export const commissionService = {
  /**
   * The ONE place a commission record is created, called from payment.service.js's settlePayment()
   * inside its existing transaction, right after a booking reaches CONFIRMED. `booking` is the row
   * locked earlier in that same transaction (still carrying its pre-update subtotal/discount columns);
   * `payment` is the row locked alongside it.
   *
   * eligible_accommodation = subtotal - discount_minor (the hotel's OWN discount; see migration 016 --
   * coupon_discount_minor is a separate, platform-funded cost, tracked only informationally here, never
   * subtracted from what the hotel earns or what commission is based on).
   *
   * Idempotent two ways: `booking_commissions.booking_id` is UNIQUE with ON CONFLICT DO NOTHING (returns
   * no id on a repeat call, so the ledger insert below is skipped), on top of settlePayment's own
   * ALREADY_CONFIRMED guard that normally prevents this from running twice at all.
   */
  async computeAndRecordForBooking(client, booking, payment) {
    const hotelId = booking.hotel_id;
    const eligibleAccommodationMinor = Number(booking.subtotal_minor) - Number(booking.discount_minor);
    const config = await commissionConfigRepository.resolveRate(hotelId, new Date(), client);
    // The platform must always have a global default row (migration 022 seeds one); this guards against
    // an operator error (e.g. someone manually deleting it) producing a confusing crash instead of a
    // clear failure -- a booking can never be confirmed without a resolvable commission rate.
    if (!config) throw new Error(`No commission configuration resolved for hotel ${hotelId} -- the platform default row is missing`);
    const ratePercent = config.ratePercent;
    const commissionMinor = percentOf(eligibleAccommodationMinor, ratePercent);
    const hotelEarningsMinor = eligibleAccommodationMinor - commissionMinor;
    const platformDiscountCostMinor = Number(booking.coupon_discount_minor ?? 0);

    const commissionId = await bookingCommissionRepository.insert(client, {
      bookingId: booking.id,
      hotelId,
      paymentId: payment.id,
      currency: booking.currency,
      eligibleAccommodationMinor,
      commissionRateApplied: ratePercent,
      commissionMinor,
      hotelEarningsMinor,
      platformDiscountCostMinor,
    });
    if (!commissionId) {
      log.warn('commission already recorded for booking, skipping', { bookingId: booking.id });
      return;
    }

    await ledgerEntryRepository.insertMany(client, [
      {
        hotelId, bookingId: booking.id, entryType: LEDGER_ENTRY_TYPE.BOOKING_EARNING, direction: LEDGER_DIRECTION.CREDIT,
        amountMinor: eligibleAccommodationMinor, currency: booking.currency,
        idempotencyKey: `commission-earning:${booking.id}`, description: `Accommodation earning for booking ${booking.booking_ref}`,
      },
      {
        hotelId, bookingId: booking.id, entryType: LEDGER_ENTRY_TYPE.PLATFORM_COMMISSION, direction: LEDGER_DIRECTION.DEBIT,
        amountMinor: commissionMinor, currency: booking.currency,
        idempotencyKey: `commission-debit:${booking.id}`, description: `Platform commission (${ratePercent}%) for booking ${booking.booking_ref}`,
      },
    ]);
  },

  /**
   * The ONE place a commission reversal happens, called from refund.service.js's processRefund() inside
   * its existing success transaction. No-ops when the booking never earned a commission (the "payment
   * arrived after the hold expired" edge case never reaches CONFIRMED) or was already fully reversed.
   *
   * Both reversed amounts are computed in a SINGLE rounding step against the booking's own snapshotted
   * eligible/commission amounts -- never today's config -- to avoid double-rounding drift and to satisfy
   * "historical bookings keep the rate that applied when eligible" even on reversal.
   */
  async reverseForRefund(client, refund, booking) {
    const commission = await bookingCommissionRepository.findByBookingId(booking.id, client);
    if (!commission || commission.status === 'REVERSED') return;

    const paidMinor = Number(booking.paid_minor);
    const refundMinor = Number(refund.amount_minor);
    const reversedEligibleMinor = Math.round((commission.eligibleAccommodationMinor * refundMinor) / paidMinor);
    const reversedCommissionMinor = Math.round((commission.commissionMinor * refundMinor) / paidMinor);

    await ledgerEntryRepository.insertMany(client, [
      {
        hotelId: commission.hotelId, bookingId: booking.id, refundId: refund.id,
        entryType: LEDGER_ENTRY_TYPE.COMMISSION_REVERSAL, direction: LEDGER_DIRECTION.CREDIT,
        amountMinor: reversedCommissionMinor, currency: commission.currency,
        idempotencyKey: `refund-reversal-commission:${refund.id}`, description: `Commission reversal for refund on booking ${booking.booking_ref}`,
      },
      {
        hotelId: commission.hotelId, bookingId: booking.id, refundId: refund.id,
        entryType: LEDGER_ENTRY_TYPE.REFUND_ADJUSTMENT, direction: LEDGER_DIRECTION.DEBIT,
        amountMinor: reversedEligibleMinor, currency: commission.currency,
        idempotencyKey: `refund-reversal-earning:${refund.id}`, description: `Earnings reversal for refund on booking ${booking.booking_ref}`,
      },
    ]);

    if (refundMinor >= paidMinor) {
      await bookingCommissionRepository.markReversed(client, commission.id);
    }
  },

  async getGlobalConfig() {
    const effective = await commissionConfigRepository.resolveRate(null, new Date());
    const history = await commissionConfigRepository.globalHistory();
    return { effective, history };
  },

  async getHotelConfig(hotelId) {
    const effective = await commissionConfigRepository.resolveRate(hotelId, new Date());
    const history = await commissionConfigRepository.historyForHotel(hotelId);
    return { effective, history };
  },

  async setGlobalRate({ ratePercent, reason }, actor) {
    return withTransaction(async (client) => {
      const id = await commissionConfigRepository.insert(client, { hotelId: null, ratePercent, reason, createdBy: actor.id });
      await auditService.record(client, {
        actor, action: 'commission.rate_changed', entity: 'commission_config', entityId: 'GLOBAL', newValue: { ratePercent, reason },
      });
      return id;
    }).then(() => this.getGlobalConfig());
  },

  async setHotelRate(hotelId, { ratePercent, reason }, actor) {
    if (actor.roles.includes('HOTEL_OWNER')) {
      throw AppError.forbidden('Only administrators can change commission rates');
    }
    return withTransaction(async (client) => {
      await commissionConfigRepository.insert(client, { hotelId, ratePercent, reason, createdBy: actor.id });
      await auditService.record(client, {
        actor, action: 'commission.rate_changed', entity: 'commission_config', entityId: hotelId, newValue: { ratePercent, reason },
      });
    }).then(() => this.getHotelConfig(hotelId));
  },
};
