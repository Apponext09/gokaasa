import { roomTypeRepository } from '../repositories/roomType.repository.js';
import { ratePlanRepository } from '../repositories/ratePlan.repository.js';
import { cancellationPolicyRepository } from '../repositories/cancellationPolicy.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { loadNightly } from './inventory.service.js';
import { getStorage } from '../storage/index.js';
import { occupancyFits, stayLengthCheck } from '../domain/inventory.js';
import { describePolicy } from '../domain/cancellationPolicy.js';
import { localToday, zonedTimeToInstant } from '../domain/businessDate.js';
import { nightsBetween, quoteNights } from '../domain/pricing.js';
import { AppError } from '../utils/AppError.js';

/** Bump when the snapshot's shape changes, so old snapshots can still be read correctly. */
export const QUOTE_SNAPSHOT_VERSION = 1;

const DEFAULT_CHECK_IN_TIME = '14:00';

/**
 * Prices a stay from the database, never from the client. Must run inside a transaction.
 *
 * With `checkAvailability` (the default) the room type row is locked and every night is checked: room is
 * active, not closed, stay length allowed, enough rooms free. Re-quoting an existing hold passes
 * `checkAvailability: false`, because that hold's own reservations would otherwise count against it; the
 * hold already keeps those rooms.
 */
export async function quoteStay(client, input, { checkAvailability = true } = {}) {
  const { hotelId, roomTypeId, ratePlanId, checkIn, checkOut, rooms, occupancy, today: todayOverride } = input;

  const hotel = await bookingRepository.publishedHotel(hotelId, client);
  if (!hotel) throw AppError.notFound('Hotel not found');

  // "Today" is the hotel's local calendar date: a guest in Mumbai can book for tomorrow from late evening UTC.
  const today = todayOverride ?? localToday(hotel.time_zone);
  if (checkIn < today) throw AppError.unprocessable('Check-in cannot be in the past', [{ field: 'checkIn', message: 'Pick a date from today onwards' }]);

  if (checkAvailability) {
    await roomTypeRepository.lockById(roomTypeId, client);
  }
  const room = await roomTypeRepository.findById(roomTypeId, client);
  if (!room || room.hotel_id !== hotel.id || room.status !== 'ACTIVE') {
    throw AppError.conflict('This room type is not available for booking');
  }

  const plan = await ratePlanRepository.findById(ratePlanId, client);
  if (!plan || plan.room_type_id !== roomTypeId || plan.status !== 'ACTIVE') {
    throw AppError.conflict('This rate is no longer available. Please search again.');
  }

  const policyRow = await cancellationPolicyRepository.effectiveForPlan(plan.id, client);
  if (!policyRow) throw AppError.conflict('This rate has no cancellation policy and cannot be booked. Please choose another rate.');

  // Each room must fit the room type on its own.
  for (const [index, guests] of occupancy.entries()) {
    const fits = occupancyFits({
      rooms: 1,
      adults: guests.adults,
      children: guests.childAges.length,
      maxAdults: room.max_adults,
      maxChildren: room.max_children,
      maxOccupancy: room.max_occupancy,
    });
    if (!fits) {
      throw AppError.unprocessable(`Room ${index + 1} has too many guests for this room type`, [
        { field: `occupancy.${index}`, message: `This room sleeps up to ${room.max_occupancy} guests` },
      ]);
    }
  }

  const nights = nightsBetween(checkIn, checkOut);
  let availableRooms = null;
  if (checkAvailability) {
    const nightly = await loadNightly(client, [roomTypeId], nights);
    const facts = nights.map((date) => nightly.get(`${roomTypeId}|${date}`));
    if (facts.some((night) => night.isClosed)) {
      throw AppError.conflict('This room type is closed for some of your dates.');
    }
    const stay = stayLengthCheck(facts, nights.length);
    if (!stay.ok) {
      throw AppError.unprocessable(
        `This room needs a stay of ${stay.minRequired ?? 1} to ${stay.maxAllowed ?? 'any number of'} nights for these dates.`,
      );
    }
    availableRooms = Math.min(...facts.map((night) => night.sellable));
    if (availableRooms < rooms) {
      if (availableRooms <= 0) throw AppError.conflict('No rooms are available for your selected dates.', { available: 0, requested: rooms });
      throw AppError.conflict(`Only ${availableRooms} rooms are available for your selected dates.`, {
        available: availableRooms,
        requested: rooms,
      });
    }
  }

  const priceRows = await bookingRepository.nightlyPrices(plan.id, checkIn, checkOut, client);
  if (priceRows.length !== nights.length) {
    throw AppError.conflict('Rates are not available for every night of your stay.');
  }
  const nightlyRows = priceRows.map((row) => ({
    date: row.stay_date,
    base: row.base_price_minor,
    discount: row.discount_minor,
    tax: row.tax_minor,
    fee: row.fee_minor,
    final: row.final_price_minor,
  }));
  const totals = quoteNights(nightlyRows, rooms);
  const total = totals.subtotal - totals.discount + totals.taxes + totals.fees;

  const policy = {
    policy_id: policyRow.id,
    code: policyRow.code,
    name: policyRow.name,
    description: describePolicy(policyRow),
    is_non_refundable: policyRow.is_non_refundable,
    cancellation_deadline_hours: policyRow.cancellation_deadline_hours,
    refund_percent: policyRow.refund_percent,
  };

  // Check-in instant in the hotel's own zone. Cancellation deadlines are measured from this instant.
  const checkInAt = zonedTimeToInstant(checkIn, (hotel.check_in_time ?? DEFAULT_CHECK_IN_TIME).slice(0, 5), hotel.time_zone);

  const cover = hotel.cover_storage_key ? getStorage().publicUrl(hotel.cover_storage_key) : null;
  const snapshot = {
    version: QUOTE_SNAPSHOT_VERSION,
    quotedAt: new Date().toISOString(),
    hotel: {
      id: hotel.id,
      slug: hotel.slug,
      name: hotel.name,
      address: [hotel.address_line, hotel.area, hotel.city].filter(Boolean).join(', '),
      city: hotel.city,
      countryCode: hotel.country_code,
      timeZone: hotel.time_zone,
      imageUrl: cover,
      checkInAt: checkInAt.toISOString(),
    },
    room: { id: room.id, name: room.name, maxAdults: room.max_adults, maxChildren: room.max_children, maxOccupancy: room.max_occupancy },
    ratePlan: {
      id: plan.id,
      name: plan.name,
      mealPlan: plan.meal_plan,
      isRefundable: plan.is_refundable,
      currency: plan.currency,
    },
    cancellationPolicy: policy,
    stay: { checkIn, checkOut, nights: nights.length, rooms, occupancy },
    nightly: nightlyRows.map((row) => ({ date: row.date, base: row.base, discount: row.discount, tax: row.tax, fee: row.fee, final: row.final })),
    totals: { subtotal: totals.subtotal, discount: totals.discount, taxes: totals.taxes, fees: totals.fees, total },
  };

  return {
    hotelId: hotel.id,
    roomTypeId,
    ratePlanId: plan.id,
    checkIn,
    checkOut,
    nights: nights.length,
    rooms,
    occupancy,
    currency: plan.currency,
    subtotal: totals.subtotal,
    discount: totals.discount,
    taxes: totals.taxes,
    fees: totals.fees,
    total,
    checkInAt,
    availableRooms,
    snapshot,
  };
}

/** The customer-facing view of a quote or a stored snapshot. Same shape from both sources. */
export function quoteView(snapshot, hold = null) {
  return {
    hotel: { ...snapshot.hotel },
    room: { ...snapshot.room },
    ratePlan: { ...snapshot.ratePlan },
    cancellationPolicy: {
      code: snapshot.cancellationPolicy.code,
      name: snapshot.cancellationPolicy.name,
      description: snapshot.cancellationPolicy.description,
      isNonRefundable: snapshot.cancellationPolicy.is_non_refundable,
      deadlineHours: snapshot.cancellationPolicy.cancellation_deadline_hours,
      refundPercent: snapshot.cancellationPolicy.refund_percent,
    },
    stay: { ...snapshot.stay },
    nightly: snapshot.nightly.map((row) => ({ date: row.date, final: row.final })),
    totals: { ...snapshot.totals, currency: snapshot.ratePlan.currency },
    ...(hold ? { holdId: hold.id } : {}),
  };
}
