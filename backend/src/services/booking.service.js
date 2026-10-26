import { pool, withTransaction } from '../db/pool.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { describePolicy, refundFor } from '../domain/cancellationPolicy.js';
import { localToday } from '../domain/businessDate.js';
import { BOOKING_STATUS, assertTransition } from '../domain/bookingStatus.js';
import { PAYMENT_STATUS } from '../domain/paymentStatus.js';
import { config } from '../config/index.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { auditService } from './audit.service.js';
import { notificationService } from '../notifications/notificationService.js';
import { processRefund } from './refund.service.js';
import { reviewRepository } from '../repositories/review.repository.js';
import { emailNotificationService } from './emailNotification.service.js';

const log = createLogger('booking');
const MS_PER_HOUR = 60 * 60 * 1000;

// Scrambles the booking sequence into a non-sequential-looking number so two consecutive bookings don't
// get visibly adjacent references. This is one step of modular multiplication, a bijection rather than a
// hash: every sequence value still maps to its own unique output, so there is no collision risk to retry
// around. 2^31-1 is prime and far beyond any realistic booking volume; 48271 is coprime to it (any value
// in [1, modulus) is, since the modulus is prime), so the mapping covers the full range one-to-one.
const REF_SCRAMBLE_MODULUS = 2_147_483_647;
const REF_SCRAMBLE_MULTIPLIER = 48_271;

function scrambleSequence(sequence) {
  return (sequence * REF_SCRAMBLE_MULTIPLIER) % REF_SCRAMBLE_MODULUS;
}

/** Booking reference: GK-<year in the business zone>-<scrambled sequence>, from one sequence, never reused. */
function bookingRefFor(sequence) {
  const year = localToday(config.booking.businessTimezone).slice(0, 4);
  return `GK-${year}-${String(scrambleSequence(sequence)).padStart(7, '0')}`;
}

/**
 * Creates the booking for a hold, once. The snapshot is copied from the hold's stored quote, so later hotel,
 * room, rate or policy edits never change it. Must run with the hold locked.
 */
export async function ensureBookingForHold(client, hold) {
  const existing = await bookingRepository.findBookingByHold(hold.id, client);
  if (existing) return existing;

  const details = hold.guest_details;
  if (!details) throw AppError.unprocessable('Add your guest details before paying');

  const snapshot = hold.quote_snapshot;
  const sequence = await bookingRepository.nextBookingSequence(client);
  const primary = details.primaryContact;
  const bookingId = await bookingRepository.insertBooking(client, {
    booking_ref: bookingRefFor(sequence),
    user_id: hold.user_id,
    hotel_id: hold.hotel_id,
    hold_id: hold.id,
    status: BOOKING_STATUS.INITIATED,
    check_in: hold.check_in,
    check_out: hold.check_out,
    check_in_at: snapshot.hotel.checkInAt,
    adults: hold.occupancy.reduce((sum, room) => sum + room.adults, 0),
    children: hold.occupancy.reduce((sum, room) => sum + room.childAges.length, 0),
    rooms_count: hold.rooms,
    currency: hold.currency,
    subtotal_minor: Number(hold.subtotal_minor),
    taxes_minor: Number(hold.taxes_minor),
    fees_minor: Number(hold.fees_minor),
    discount_minor: Number(hold.discount_minor),
    coupon_id: hold.coupon_id ?? null,
    coupon_code: hold.coupon_code ?? null,
    coupon_discount_minor: Number(hold.coupon_discount_minor ?? 0),
    total_minor: Number(hold.total_minor),
    cancellation_policy: JSON.stringify(snapshot.cancellationPolicy),
    cancellation_deadline_at: snapshot.cancellationPolicy.cancellation_deadline_hours == null
      ? null
      : new Date(new Date(snapshot.hotel.checkInAt).getTime() - snapshot.cancellationPolicy.cancellation_deadline_hours * MS_PER_HOUR).toISOString(),
    primary_first_name: primary.firstName,
    primary_last_name: primary.lastName,
    primary_email: primary.email,
    primary_phone: primary.mobile,
    gst_number: details.gstNumber ?? null,
    company_name: details.companyName ?? null,
    billing_address: details.billingAddress ?? null,
    special_request: details.specialRequest ?? null,
    hotel_name: snapshot.hotel.name,
    hotel_slug: snapshot.hotel.slug,
    hotel_address: snapshot.hotel.address,
    hotel_city: snapshot.hotel.city,
    hotel_country_code: snapshot.hotel.countryCode,
    hotel_image_url: snapshot.hotel.imageUrl,
    rate_plan_name: snapshot.ratePlan.name,
    meal_plan: snapshot.ratePlan.mealPlan,
    is_refundable: snapshot.ratePlan.isRefundable && !snapshot.cancellationPolicy.is_non_refundable,
    paid_minor: 0,
  });

  assertTransition(BOOKING_STATUS.INITIATED, BOOKING_STATUS.PAYMENT_PENDING);
  await bookingRepository.setBookingStatus(client, bookingId, BOOKING_STATUS.PAYMENT_PENDING);
  await bookingRepository.linkHoldToBooking(client, hold.id, bookingId);

  await bookingRepository.insertBookingRoom(client, {
    bookingId,
    roomTypeId: hold.room_type_id,
    roomName: snapshot.room.name,
    mealPlan: snapshot.ratePlan.mealPlan,
    ratePlanId: hold.rate_plan_id,
    ratePlanName: snapshot.ratePlan.name,
    quantity: hold.rooms,
    nights: hold.nights,
    ratePerNight: Math.round(Number(hold.total_minor) / hold.rooms / hold.nights),
    subtotal: Number(hold.subtotal_minor),
    discount: Number(hold.discount_minor),
    taxes: Number(hold.taxes_minor),
    fees: Number(hold.fees_minor),
    total: Number(hold.total_minor),
  });

  // Additional guest names are optional (Feature 3) -- a room's `guests` entries may be shorter than its
  // occupancy, and an entry with no name at all is never stored as a fabricated "Guest 2"/"Unknown" row.
  // The hotel collects whatever is still missing at check-in; see adminBooking.service.js's detail view.
  let isFirstNamedGuest = true;
  for (const [roomIndex, room] of details.rooms.entries()) {
    for (const guest of room.guests) {
      if (!guest.firstName || !guest.lastName) continue;
      await bookingRepository.insertBookingGuest(client, {
        bookingId,
        roomIndex: room.roomIndex ?? roomIndex,
        fullName: `${guest.firstName} ${guest.lastName}`,
        firstName: guest.firstName,
        lastName: guest.lastName,
        age: guest.age ?? null,
        isPrimary: isFirstNamedGuest,
      });
      isFirstNamedGuest = false;
    }
  }

  await auditService.record(client, {
    actor: { id: hold.user_id },
    action: 'booking.initiated',
    entity: 'booking',
    entityId: bookingId,
    newValue: { holdId: hold.id, total: Number(hold.total_minor), currency: hold.currency },
  });
  log.info('booking initiated', { bookingId, holdId: hold.id, rooms: hold.rooms, nights: hold.nights });
  return bookingRepository.findBooking(bookingId, client);
}

/** Money and dates the guest sees. Derived from the snapshot columns, so they never change after booking. */
function paymentStatusOf(payments) {
  const latest = payments[payments.length - 1];
  if (!latest) return 'NOT_STARTED';
  return {
    [PAYMENT_STATUS.SUCCESS]: 'PAID',
    [PAYMENT_STATUS.REFUNDED]: 'REFUNDED',
    [PAYMENT_STATUS.FAILED]: 'FAILED',
    [PAYMENT_STATUS.PENDING]: 'PENDING',
    [PAYMENT_STATUS.CREATED]: 'PENDING',
  }[latest.status];
}

export function toBookingSummary(booking) {
  return {
    id: booking.id,
    bookingRef: booking.booking_ref,
    status: booking.status,
    hotel: {
      name: booking.hotel_name,
      slug: booking.hotel_slug,
      address: booking.hotel_address,
      city: booking.hotel_city,
      imageUrl: booking.hotel_image_url,
    },
    roomName: null,
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    rooms: booking.rooms_count,
    totalMinor: Number(booking.total_minor),
    currency: booking.currency,
    paidMinor: Number(booking.paid_minor),
    createdAt: booking.created_at,
    review: null,
  };
}

export async function buildBookingDto(client, booking, { includePreview = true } = {}) {
  const db = client ?? pool;
  const [rooms, guests, payments, refunds, review] = await Promise.all([
    bookingRepository.bookingRooms(booking.id, db),
    bookingRepository.bookingGuests(booking.id, db),
    paymentRepository.paymentsForBooking(booking.id, db),
    paymentRepository.refundsForBooking(booking.id, db),
    reviewRepository.findByBookingId(booking.id, db),
  ]);
  const latestPayment = payments[payments.length - 1] ?? null;
  const paid = payments.find((p) => p.status === PAYMENT_STATUS.SUCCESS || p.status === PAYMENT_STATUS.REFUNDED) ?? null;
  const policy = booking.cancellation_policy;
  const dto = {
    id: booking.id,
    bookingRef: booking.booking_ref,
    // Exposed so the client can resume payment on a PAYMENT_PENDING booking (POST /payments/create-order
    // is re-callable with this same holdId -- see payment.service.js#createOrder's `hold.booking_id`
    // branch) without a separate "resume" endpoint. Harmless once the booking is CONFIRMED/CANCELLED/etc.
    holdId: booking.hold_id,
    status: booking.status,
    paymentStatus: paymentStatusOf(payments),
    hotel: {
      name: booking.hotel_name,
      slug: booking.hotel_slug,
      address: booking.hotel_address,
      city: booking.hotel_city,
      countryCode: booking.hotel_country_code,
      imageUrl: booking.hotel_image_url,
    },
    rooms: rooms.map((room) => ({
      name: room.room_name,
      mealPlan: room.meal_plan,
      ratePlanName: room.rate_plan_name,
      quantity: room.quantity,
      nights: room.nights,
      totalMinor: Number(room.total_minor),
    })),
    stay: {
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      nights: Math.round((Date.parse(`${booking.check_out}T00:00:00Z`) - Date.parse(`${booking.check_in}T00:00:00Z`)) / 86_400_000),
      rooms: booking.rooms_count,
      adults: booking.adults,
      children: booking.children,
    },
    guests: guests.map((guest) => ({ roomIndex: guest.room_index, name: guest.full_name, age: guest.age, isPrimary: guest.is_primary })),
    primaryContact: {
      firstName: booking.primary_first_name,
      lastName: booking.primary_last_name,
      email: booking.primary_email,
      mobile: booking.primary_phone,
    },
    gstNumber: booking.gst_number,
    companyName: booking.company_name,
    billingAddress: booking.billing_address,
    specialRequest: booking.special_request,
    amounts: {
      currency: booking.currency,
      subtotal: Number(booking.subtotal_minor),
      discount: Number(booking.discount_minor),
      couponCode: booking.coupon_code,
      couponDiscount: Number(booking.coupon_discount_minor ?? 0),
      taxes: Number(booking.taxes_minor),
      fees: Number(booking.fees_minor),
      total: Number(booking.total_minor),
      paid: Number(booking.paid_minor),
      refunded: Number(booking.refunded_minor),
    },
    payment: latestPayment
      ? {
        id: paid?.provider_payment_id ?? null,
        orderId: latestPayment.provider_order_id,
        status: latestPayment.status,
        method: paid?.provider_payload?.method ?? null,
        paidAt: paid?.paid_at ?? null,
        attempts: payments.length,
      }
      : null,
    refunds: refunds.map((refund) => ({
      id: refund.id,
      amount: Number(refund.amount_minor),
      status: refund.status,
      processedAt: refund.processed_at,
    })),
    cancellation: {
      policyName: policy?.name ?? null,
      description: policy ? describePolicy(policy) : null,
      isRefundable: booking.is_refundable,
      deadlineAt: booking.cancellation_deadline_at,
      checkInAt: booking.check_in_at,
      cancelledAt: booking.cancelled_at,
      reason: booking.cancellation_reason,
    },
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
    // Lets the guest's own booking detail page offer Write/View Review without a second round trip.
    review: review ? { id: review.id, status: review.status } : null,
  };
  if (includePreview && booking.status === BOOKING_STATUS.CONFIRMED) {
    dto.cancellation.preview = previewFor(booking);
  }
  return dto;
}

/**
 * What cancelling would refund right now, using the policy snapshotted on the booking, not the hotel's
 * current policy. Pure: the refund amount is computed here and stored when the guest actually cancels.
 */
export function previewFor(booking, nowMs = Date.now()) {
  const checkInAt = new Date(booking.check_in_at).getTime();
  const hoursBeforeCheckIn = (checkInAt - nowMs) / MS_PER_HOUR;
  const paidMinor = Number(booking.paid_minor);
  const passedCheckIn = hoursBeforeCheckIn <= 0;
  const refund = passedCheckIn
    ? { refundMinor: 0, refundPercent: 0, reason: 'AFTER_CHECK_IN' }
    : refundFor(booking.cancellation_policy, { amountMinor: paidMinor, hoursBeforeCheckIn });
  return {
    canCancel: !passedCheckIn,
    refundMinor: refund.refundMinor,
    refundPercent: refund.refundPercent,
    reason: refund.reason,
    nonRefundableMinor: paidMinor - refund.refundMinor,
    currency: booking.currency,
    deadlineAt: booking.cancellation_deadline_at,
  };
}

async function requireOwnedBooking(client, userId, bookingId, { lock = false } = {}) {
  const db = client ?? pool;
  const booking = lock ? await bookingRepository.lockBooking(bookingId, db) : await bookingRepository.findBooking(bookingId, db);
  if (!booking || booking.user_id !== userId) throw AppError.notFound('Booking not found');
  return booking;
}

export const bookingService = {
  async details(userId, bookingId) {
    const booking = await requireOwnedBooking(null, userId, bookingId);
    return buildBookingDto(null, booking);
  },

  /** For the confirmation page. Only the owner can read it, and it is the same snapshot as My Trips. */
  async confirmation(userId, bookingId) {
    return this.details(userId, bookingId);
  },

  async list(userId, tab) {
    const today = localToday(config.booking.businessTimezone);
    const rows = await bookingRepository.listForUser(userId, tab, today);
    // Only a completed stay can carry a review, but looking it up for any tab is cheap (one indexed
    // batch query) and keeps this function from needing to know the eligibility rule itself.
    const reviews = await reviewRepository.findByBookingIds(rows.map((row) => row.id));
    const reviewByBookingId = new Map(reviews.map((review) => [review.booking_id, review]));
    const items = [];
    for (const row of rows) {
      const summary = toBookingSummary(row);
      const rooms = await bookingRepository.bookingRooms(row.id);
      summary.roomName = rooms[0]?.room_name ?? null;
      const review = reviewByBookingId.get(row.id);
      summary.review = review ? { id: review.id, status: review.status } : null;
      items.push(summary);
    }
    return { tab, items };
  },

  async cancellationPreview(userId, bookingId) {
    const booking = await requireOwnedBooking(null, userId, bookingId);
    if (booking.status !== BOOKING_STATUS.CONFIRMED) {
      throw AppError.conflict('Only confirmed bookings can be cancelled');
    }
    return previewFor(booking);
  },

  /**
   * Cancels a confirmed booking. The refund is computed from the snapshotted policy and the amount actually
   * paid. Rooms are released in the same transaction. A refund, if any, is then sent to the gateway; a repeat
   * request for an already cancelled booking returns the booking as it is.
   */
  async cancel(userId, bookingId, { reason } = {}) {
    const outcome = await withTransaction(async (client) => {
      const booking = await requireOwnedBooking(client, userId, bookingId, { lock: true });
      return performCancel(client, booking, { reason, actor: { id: userId } });
    });
    return finishCancel(bookingId, outcome);
  },

  /**
   * Same cancellation, triggered by staff rather than the guest. The caller (adminBooking.service.js) is
   * responsible for the hotel-manager-scoping check; this only looks the booking up by id, with no
   * ownership filter, and reuses the exact same refund logic — nothing is reimplemented here.
   */
  async cancelAsAdmin(bookingId, { reason } = {}, actor) {
    const outcome = await withTransaction(async (client) => {
      const booking = await bookingRepository.lockBooking(bookingId, client);
      if (!booking) throw AppError.notFound('Booking not found');
      return performCancel(client, booking, { reason, actor });
    });
    return finishCancel(bookingId, outcome);
  },
};

/** The part of cancellation shared by the guest and staff paths: everything after the booking is loaded. */
async function performCancel(client, booking, { reason, actor }) {
  if (booking.status !== BOOKING_STATUS.CONFIRMED) {
    return { booking, refundId: null, idempotent: true };
  }
  const preview = previewFor(booking);
  if (!preview.canCancel) throw AppError.conflict('This stay has already started, so it cannot be cancelled online.');

  const payment = await paymentRepository.findSuccessfulForBooking(booking.id, client);
  let refundId = null;
  assertTransition(booking.status, BOOKING_STATUS.CANCELLED);
  await bookingRepository.setBookingStatus(client, booking.id, BOOKING_STATUS.CANCELLED, {
    cancelled_at: new Date(),
    cancellation_reason: reason ?? 'GUEST_REQUEST',
  });
  await bookingRepository.releaseReservationsForBooking(client, booking.id);

  if (preview.refundMinor > 0) {
    if (!payment) throw AppError.serviceUnavailable('The payment for this booking could not be found.');
    refundId = await paymentRepository.insertRefund(client, {
      paymentId: payment.id,
      bookingId: booking.id,
      amountMinor: preview.refundMinor,
      reason: preview.reason,
      idempotencyKey: `cancel:${booking.id}:${payment.id}`,
    });
    assertTransition(BOOKING_STATUS.CANCELLED, BOOKING_STATUS.REFUND_PENDING);
    await bookingRepository.setBookingStatus(client, booking.id, BOOKING_STATUS.REFUND_PENDING);
  }

  await auditService.record(client, {
    actor,
    action: 'booking.cancelled',
    entity: 'booking',
    entityId: booking.id,
    newValue: { refundMinor: preview.refundMinor, reason: preview.reason },
  });
  return { booking, refundId, refundAmountMinor: preview.refundMinor, idempotent: false };
}

async function finishCancel(bookingId, outcome) {
  if (outcome.refundId) {
    const freshForRefundNotice = await bookingRepository.findBooking(bookingId);
    try {
      await withTransaction((client) => emailNotificationService.enqueueBookingEvent(client, freshForRefundNotice, {
        type: 'refund.initiated', template: 'refundInitiated', amount: outcome.refundAmountMinor,
      }));
      await emailNotificationService.processEvent(`refund.initiated:${freshForRefundNotice.booking_ref}`);
    } catch (error) {
      log.error('refund-initiated email enqueue failed', { bookingRef: freshForRefundNotice.booking_ref, message: error.message });
    }
    await notificationService.sendRefundInitiated(freshForRefundNotice, { amount_minor: outcome.refundAmountMinor }).catch(() => {});
    await processRefund(outcome.refundId);
  }
  log.info('booking cancelled', { bookingId, refund: Boolean(outcome.refundId), idempotent: outcome.idempotent });
  const fresh = await bookingRepository.findBooking(bookingId);
  try {
    await withTransaction((client) => emailNotificationService.enqueueBookingEvent(client, fresh, {
      type: 'booking.cancelled', template: 'cancellation', refundStatus: outcome.refundId ? 'Refund in progress' : 'No refund due',
    }));
    await emailNotificationService.processEvent(`booking.cancelled:${fresh.booking_ref}`);
  } catch (error) {
    log.error('cancellation email enqueue failed', { bookingRef: fresh.booking_ref, message: error.message });
  }
  await notificationService.sendCancellation(fresh).catch(() => {});
  return buildBookingDto(null, fresh, { includePreview: false });
}

