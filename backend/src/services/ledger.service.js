import { hotelRepository } from '../repositories/hotel.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { bookingCommissionRepository } from '../repositories/bookingCommission.repository.js';
import { ledgerEntryRepository } from '../repositories/ledgerEntry.repository.js';
import { settlementRepository } from '../repositories/settlement.repository.js';
import { LEDGER_ENTRY_TYPE } from '../domain/ledgerEntry.js';
import { toPage } from './presenters.js';
import { AppError } from '../utils/AppError.js';

/**
 * Resolves which hotels `actor` may see. `null` = ADMIN, unscoped. An explicit `requestedHotelId` that
 * is outside the caller's own managed hotels scopes to NOTHING (an empty array), never widens -- the
 * same "hide, don't reveal" rule `requireHotelAccess` already applies elsewhere.
 */
async function resolveScopedHotelIds(actor, requestedHotelId) {
  if (actor.roles.includes('ADMIN')) {
    return requestedHotelId ? [requestedHotelId] : null;
  }
  const managed = await hotelRepository.managedHotelIds(actor.id);
  if (requestedHotelId) {
    return managed.includes(requestedHotelId) ? [requestedHotelId] : [];
  }
  return managed;
}

function sumFor(summaryRows, entryType, direction) {
  return summaryRows.find((row) => row.entryType === entryType && row.direction === direction)?.totalMinor ?? 0;
}

export const ledgerService = {
  /**
   * Every figure here is derived straight from partner_ledger_entries/settlements -- never a cached
   * balance that could drift from the ledger.
   */
  async summaryForActor(actor, { hotelId } = {}) {
    const hotelIds = await resolveScopedHotelIds(actor, hotelId);
    if (hotelIds !== null && hotelIds.length === 0) {
      return {
        grossBookingRevenueMinor: 0, commissionMinor: 0, hotelEarningsBeforeAdjustmentsMinor: 0,
        refundAdjustmentsMinor: 0, netEarningsMinor: 0, availableForSettlementMinor: 0,
        pendingSettlementsMinor: 0, completedSettlementsMinor: 0, currency: 'INR',
      };
    }

    const [summary, balances, settlementTotals] = await Promise.all([
      ledgerEntryRepository.summaryForHotels(hotelIds),
      ledgerEntryRepository.balanceForHotels(hotelIds),
      settlementRepository.sumByStatus(hotelIds),
    ]);

    const grossBookingRevenueMinor = sumFor(summary, LEDGER_ENTRY_TYPE.BOOKING_EARNING, 'CREDIT');
    const commissionMinor = sumFor(summary, LEDGER_ENTRY_TYPE.PLATFORM_COMMISSION, 'DEBIT');
    const refundAdjustmentsMinor = sumFor(summary, LEDGER_ENTRY_TYPE.REFUND_ADJUSTMENT, 'DEBIT');
    const commissionReversalMinor = sumFor(summary, LEDGER_ENTRY_TYPE.COMMISSION_REVERSAL, 'CREDIT');
    const netEarningsMinor = summary.reduce((sum, row) => sum + (row.direction === 'CREDIT' ? row.totalMinor : -row.totalMinor), 0);
    const availableForSettlementMinor = balances.reduce((sum, row) => sum + row.balanceMinor, 0);
    const pendingSettlementsMinor = settlementTotals
      .filter((row) => ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING'].includes(row.status))
      .reduce((sum, row) => sum + row.totalMinor, 0);
    const completedSettlementsMinor = settlementTotals.filter((row) => row.status === 'PAID').reduce((sum, row) => sum + row.totalMinor, 0);

    return {
      grossBookingRevenueMinor,
      commissionMinor: commissionMinor - commissionReversalMinor,
      hotelEarningsBeforeAdjustmentsMinor: grossBookingRevenueMinor - commissionMinor,
      refundAdjustmentsMinor,
      netEarningsMinor,
      availableForSettlementMinor,
      pendingSettlementsMinor,
      completedSettlementsMinor,
      currency: 'INR',
    };
  },

  async entriesForActor(actor, { hotelId, bookingId, entryType, from, to, page, limit }) {
    const hotelIds = await resolveScopedHotelIds(actor, hotelId);
    if (hotelIds !== null && hotelIds.length === 0) return toPage([], 0, page, limit);
    const { total, rows } = await ledgerEntryRepository.listForHotels(hotelIds, { page, limit, bookingId, entryType, from, to });
    return toPage(rows, total, page, limit);
  },

  async commissionsForActor(actor, { hotelId, status, page, limit }) {
    const hotelIds = await resolveScopedHotelIds(actor, hotelId);
    if (hotelIds !== null && hotelIds.length === 0) return toPage([], 0, page, limit);
    const { total, rows } = await bookingCommissionRepository.listForHotels(hotelIds, { page, limit, status });
    return toPage(rows, total, page, limit);
  },

  async bookingDetailForActor(actor, bookingId) {
    const booking = await bookingRepository.findBooking(bookingId);
    if (!booking) throw AppError.notFound('Booking not found');
    const hotelIds = await resolveScopedHotelIds(actor, booking.hotel_id);
    if (hotelIds !== null && hotelIds.length === 0) throw AppError.notFound('Booking not found');

    const [commission, entries] = await Promise.all([
      bookingCommissionRepository.findByBookingId(bookingId),
      ledgerEntryRepository.listForBooking(bookingId),
    ]);
    return { bookingId, bookingRef: booking.booking_ref, hotelId: booking.hotel_id, commission, entries };
  },
};
