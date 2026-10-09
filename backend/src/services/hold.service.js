import { withTransaction } from '../db/pool.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { inventoryRepository } from '../repositories/inventory.repository.js';
import { quoteStay, quoteView } from './quote.service.js';
import { couponService } from './coupon.service.js';
import { config } from '../config/index.js';
import { HOLD_STATUS, isHoldLive } from '../domain/holdStatus.js';
import { BOOKING_STATUS, assertTransition } from '../domain/bookingStatus.js';
import { PAYMENT_STATUS } from '../domain/paymentStatus.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { auditService } from './audit.service.js';

const log = createLogger('hold');

export const HOLD_EXPIRED_MESSAGE = 'Your room hold has expired. Please search again.';

/** Visual countdown only. The server decides expiry; the client re-fetches when this reaches zero. */
const secondsLeft = (expiresAt) => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));

function toHoldDto(hold) {
  const status = hold.status === HOLD_STATUS.HELD && !isHoldLive(hold) ? HOLD_STATUS.EXPIRED : hold.status;
  return {
    id: hold.id,
    status,
    expiresAt: hold.expires_at,
    secondsRemaining: status === HOLD_STATUS.HELD ? secondsLeft(hold.expires_at) : 0,
    bookingId: hold.booking_id,
    quote: quoteView(hold.quote_snapshot, hold),
    guestDetails: hold.guest_details ?? null,
    createdAt: hold.created_at,
  };
}

/** The inputs a hold was made with, read back from its stored columns. Used to re-quote the same stay. */
function inputFromHold(hold) {
  return {
    hotelId: Number(hold.hotel_id),
    roomTypeId: Number(hold.room_type_id),
    ratePlanId: Number(hold.rate_plan_id),
    checkIn: hold.check_in,
    checkOut: hold.check_out,
    rooms: hold.rooms,
    occupancy: hold.occupancy,
  };
}

async function requireOwnedHold(client, userId, holdId, { lock = true } = {}) {
  const hold = lock ? await bookingRepository.lockHold(holdId, client) : await bookingRepository.findHold(holdId, client);
  // A hold that belongs to someone else looks exactly like one that does not exist.
  if (!hold || hold.user_id !== userId) throw AppError.notFound('Hold not found');
  return hold;
}

/**
 * Ends a HELD hold: the hold becomes EXPIRED or RELEASED, its inventory is freed, and any unpaid booking
 * attached to it is closed with it. Runs inside a transaction that already holds the hold's row lock.
 * A paid or confirmed booking is never touched here; the caller checks that first.
 */
export async function closeHoldInTx(client, hold, { holdStatus, bookingStatus, reason }) {
  await bookingRepository.setHoldStatus(client, hold.id, holdStatus);
  await bookingRepository.setReservationsForHold(client, hold.id, 'RELEASED');
  // Mirrors the inventory release just above: a coupon's reserved usage slot is given back the same way,
  // at the same point, whenever a hold ends without becoming a paid booking.
  await couponService.releaseUsageForHold(client, hold.id);

  const booking = await bookingRepository.findBookingByHold(hold.id, client);
  if (booking && booking.status === BOOKING_STATUS.PAYMENT_PENDING) {
    const locked = await bookingRepository.lockBooking(booking.id, client);
    assertTransition(locked.status, bookingStatus);
    await bookingRepository.setBookingStatus(client, locked.id, bookingStatus, { cancellation_reason: reason });
    const open = await client.query(
      `SELECT id FROM payments WHERE booking_id = $1 AND status IN ('CREATED', 'PENDING')`,
      [locked.id],
    );
    for (const row of open.rows) {
      await paymentRepository.updatePayment(client, row.id, PAYMENT_STATUS.FAILED, { failure_reason: reason });
    }
  }
  log.info('hold closed', { holdId: hold.id, holdStatus, bookingStatus: booking ? bookingStatus : null, reason });
}

/** Expires a HELD hold whose time is up. Returns true when it changed anything. */
async function expireIfDue(client, hold) {
  if (hold.status !== HOLD_STATUS.HELD || isHoldLive(hold)) return false;
  await closeHoldInTx(client, hold, { holdStatus: HOLD_STATUS.EXPIRED, bookingStatus: BOOKING_STATUS.EXPIRED, reason: 'HOLD_EXPIRED' });
  return true;
}

export const holdService = {
  /**
   * Creates a hold. The stay is priced and availability checked in the database under the room lock; the
   * browser supplies only the choice (hotel, room type, rate plan, dates, occupancy). Rooms are then reserved
   * night by night under the same transaction, so a failure leaves nothing behind.
   */
  async create(userId, input) {
    // A double-click on "Continue", or a retried request, carries the same idempotency key the first
    // attempt did; reuse that attempt's hold instead of tying up a second set of rooms. Callers that send
    // no key (including every existing caller) get a new hold every time, exactly as before.
    if (input.idempotencyKey) {
      const existing = await bookingRepository.findHoldByIdempotencyKey(userId, input.idempotencyKey);
      if (existing) return toHoldDto(existing);
    }

    const holdMinutes = config.booking.holdDurationMinutes;
    let hold;
    try {
      hold = await withTransaction(async (client) => {
        const quote = await quoteStay(client, input, { checkAvailability: true });

        const { id, expires_at: expiresAt } = await bookingRepository.insertHold(client, {
          userId,
          hotelId: quote.hotelId,
          roomTypeId: quote.roomTypeId,
          ratePlanId: quote.ratePlanId,
          checkIn: quote.checkIn,
          checkOut: quote.checkOut,
          nights: quote.nights,
          rooms: quote.rooms,
          occupancy: quote.occupancy,
          currency: quote.currency,
          subtotal: quote.subtotal,
          discount: quote.discount,
          taxes: quote.taxes,
          fees: quote.fees,
          total: quote.total,
          quoteSnapshot: quote.snapshot,
          holdMinutes,
          idempotencyKey: input.idempotencyKey ?? null,
        });

        const nights = quote.snapshot.nightly.map((row) => row.date);
        for (const date of nights) {
          await inventoryRepository.insertHold(client, { roomTypeId: quote.roomTypeId, stayDate: date, quantity: quote.rooms, holdId: id });
        }

        await auditService.record(client, {
          actor: { id: userId },
          action: 'booking_hold.created',
          entity: 'booking_hold',
          entityId: id,
          newValue: { hotelId: quote.hotelId, roomTypeId: quote.roomTypeId, ratePlanId: quote.ratePlanId, rooms: quote.rooms, total: quote.total, currency: quote.currency },
        });
        log.info('hold created', { holdId: id, hotelId: quote.hotelId, roomTypeId: quote.roomTypeId, rooms: quote.rooms, nights: nights.length });
        return { id, expiresAt };
      });
    } catch (error) {
      // Two near-simultaneous requests with the same idempotency key can both pass the check above; the
      // unique index lets only one insert succeed, and the loser returns the winner's hold instead of an error.
      if (input.idempotencyKey && error.code === '23505' && error.constraint === 'booking_holds_idempotency_unique') {
        const existing = await bookingRepository.findHoldByIdempotencyKey(userId, input.idempotencyKey);
        if (existing) return toHoldDto(existing);
      }
      throw error;
    }
    const row = await bookingRepository.findHold(hold.id);
    return toHoldDto(row);
  },

  /** Reads a hold the caller owns. An overdue hold is expired here, so no read ever shows it as live. */
  async get(userId, holdId) {
    const row = await withTransaction(async (client) => {
      const hold = await requireOwnedHold(client, userId, holdId);
      await expireIfDue(client, hold);
      return bookingRepository.findHold(holdId, client);
    });
    return toHoldDto(row);
  },

  /** The hold to resume after a refresh, or null. */
  async active(userId) {
    const hold = await bookingRepository.activeHoldForUser(userId);
    return hold ? toHoldDto(hold) : null;
  },

  /**
   * Saves the guest details for a hold. `hold.occupancy` (set at hold creation, drives pricing and
   * inventory) remains the sole source of truth for how many adults/children are staying -- naming every
   * guest is optional beyond the required primaryContact (Feature 3: the hotel can collect any missing
   * occupant's name at check-in), so a room's named-guest list may be shorter than its occupancy, never
   * longer. Locked once a booking exists for the hold.
   */
  async saveGuests(userId, holdId, details) {
    await withTransaction(async (client) => {
      const hold = await requireOwnedHold(client, userId, holdId);
      if (!isHoldLive(hold)) throw AppError.conflict(HOLD_EXPIRED_MESSAGE, { code: 'HOLD_EXPIRED' });
      if (hold.booking_id) throw AppError.conflict('Guest details are locked because payment has started for this booking.');

      const indexes = details.rooms.map((room) => room.roomIndex).sort((a, b) => a - b);
      if (indexes.length !== hold.rooms || indexes.some((index, i) => index !== i)) {
        throw AppError.unprocessable(`Add the guests for each of the ${hold.rooms} rooms`);
      }
      const problems = [];
      for (const room of details.rooms) {
        const expected = hold.occupancy[room.roomIndex];
        const capacity = expected.adults + expected.childAges.length;
        if (room.guests.length > capacity) {
          problems.push({
            field: `rooms.${room.roomIndex}`,
            message: `Room ${room.roomIndex + 1} only has ${capacity} guest(s) booked`,
          });
        }
      }
      if (problems.length) throw AppError.unprocessable('The guest list does not match the rooms you selected', problems);

      await bookingRepository.saveHoldGuests(client, hold.id, { ...details, savedAt: new Date().toISOString() });
    });
    return this.get(userId, holdId);
  },

  /**
   * Re-prices a hold from the database. The browser shows the returned total before payment; if it changed,
   * the guest must accept it. Rooms stay held, so only prices and the policy snapshot can change here.
   */
  async requote(userId, holdId) {
    const result = await withTransaction(async (client) => {
      const hold = await requireOwnedHold(client, userId, holdId);
      if (!isHoldLive(hold)) throw AppError.conflict(HOLD_EXPIRED_MESSAGE, { code: 'HOLD_EXPIRED' });
      if (hold.booking_id) throw AppError.conflict('This booking has already started payment and can no longer be re-priced.');

      const previousTotal = Number(hold.total_minor); // may already include a coupon discount
      // The hold's own pre-coupon total, derived from its stored columns -- compared against the fresh
      // quote so that an already-applied coupon never looks like a "room price changed" event.
      const preCouponTotal = Number(hold.subtotal_minor) - Number(hold.discount_minor) + Number(hold.taxes_minor) + Number(hold.fees_minor);

      const quote = await quoteStay(client, inputFromHold(hold), { checkAvailability: false });
      const changed = quote.total !== preCouponTotal || quote.subtotal !== Number(hold.subtotal_minor);
      let newTotal = previousTotal;
      if (changed) {
        await bookingRepository.updateHoldQuote(client, hold.id, {
          subtotal: quote.subtotal,
          discount: quote.discount,
          taxes: quote.taxes,
          fees: quote.fees,
          total: quote.total,
          quoteSnapshot: quote.snapshot,
        });
        const reapplied = await couponService.reapplyOnRequote(client, hold, quote.total);
        newTotal = reapplied.total;
        await auditService.record(client, {
          actor: { id: userId },
          action: 'booking_hold.repriced',
          entity: 'booking_hold',
          entityId: hold.id,
          oldValue: { total: previousTotal },
          newValue: { total: newTotal },
        });
      }
      return { changed: changed && newTotal !== previousTotal, previousTotal, holdId: hold.id };
    });
    const hold = await this.get(userId, holdId);
    return { ...result, hold };
  },

  /** Guest leaves before paying, or abandons a failed checkout. Frees the rooms at once. */
  async release(userId, holdId, { reason = 'RELEASED_BY_GUEST' } = {}) {
    await withTransaction(async (client) => {
      const hold = await requireOwnedHold(client, userId, holdId);
      if (hold.status === HOLD_STATUS.RELEASED || hold.status === HOLD_STATUS.EXPIRED) return;
      if (hold.status === HOLD_STATUS.CONVERTED) throw AppError.conflict('This hold has already become a booking');
      if (hold.booking_id) {
        const booking = await bookingRepository.lockBooking(hold.booking_id, client);
        if (booking.status !== BOOKING_STATUS.PAYMENT_PENDING) {
          throw AppError.conflict('This booking can no longer be released. Cancel it from My Trips instead.');
        }
        const paid = await paymentRepository.findSuccessfulForBooking(booking.id, client);
        if (paid) throw AppError.conflict('A payment has already been made for this booking.');
      }
      if (hold.status === HOLD_STATUS.HELD && !isHoldLive(hold)) {
        await expireIfDue(client, hold);
        return;
      }
      await closeHoldInTx(client, hold, {
        holdStatus: HOLD_STATUS.RELEASED,
        bookingStatus: hold.booking_id ? BOOKING_STATUS.FAILED : null,
        reason,
      });
      await auditService.record(client, {
        actor: { id: userId },
        action: 'booking_hold.released',
        entity: 'booking_hold',
        entityId: hold.id,
        newValue: { reason },
      });
    });
    return this.get(userId, holdId);
  },

  /**
   * Expires overdue holds in batches. Each hold is handled in its own transaction, so one bad row cannot stall
   * the rest, and SKIP LOCKED lets several workers run safely.
   */
  async expireDueHolds({ limit = 100 } = {}) {
    const ids = await withTransaction((client) => bookingRepository.dueHoldIds(client, limit));
    let expired = 0;
    for (const id of ids) {
      try {
        await withTransaction(async (client) => {
          const hold = await bookingRepository.lockHold(id, client);
          if (hold && (await expireIfDue(client, hold))) expired += 1;
        });
      } catch (error) {
        log.error('hold expiry failed', { holdId: id, message: error.message });
      }
    }
    return expired;
  },
};

export { requireOwnedHold, toHoldDto };
