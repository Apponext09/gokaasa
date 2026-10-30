import { pool } from '../db/pool.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { roomTypeRepository } from '../repositories/roomType.repository.js';
import { ratePlanRepository } from '../repositories/ratePlan.repository.js';
import { loadNightly } from './inventory.service.js';
import { getStorage } from '../storage/index.js';
import { occupancyFits } from '../domain/inventory.js';
import { describePolicy } from '../domain/cancellationPolicy.js';
import { occupancyFromTotals, occupancyTotals } from '../domain/occupancy.js';
import { MAX_STAY_NIGHTS, nightsBetween, priceComponents, quoteNights } from '../domain/pricing.js';
import { AppError } from '../utils/AppError.js';
import { localToday } from '../domain/businessDate.js';
import { config } from '../config/index.js';

function toPolicy(row) {
  if (!row.policy_id) return null;
  return {
    code: row.policy_code,
    name: row.policy_name,
    description: describePolicy({
      is_non_refundable: row.policy_is_non_refundable,
      cancellation_deadline_hours: row.policy_deadline_hours,
      refund_percent: row.policy_refund_percent,
    }),
    isNonRefundable: row.policy_is_non_refundable,
    deadlineHours: row.policy_deadline_hours,
    refundPercent: row.policy_refund_percent,
  };
}

/** Customer-facing room details. Internal counts (blocked, reserved, units) are never included. */
function toPublicRoom(room, amenities, images) {
  return {
    id: room.id,
    roomCode: room.room_code,
    name: room.name,
    category: room.category,
    description: room.description,
    bedType: room.bed_type,
    bedCount: room.bed_count,
    roomSizeSqm: room.room_size_sqm == null ? null : Number(room.room_size_sqm),
    view: room.view,
    smoking: room.smoking,
    maxAdults: room.max_adults,
    maxChildren: room.max_children,
    maxOccupancy: room.max_occupancy,
    amenities: amenities.map((amenity) => ({ code: amenity.code, name: amenity.name })),
    images: images.map((image) => ({
      id: image.id,
      url: getStorage().publicUrl(image.storage_key),
      altText: image.alt_text,
      isCover: image.is_cover,
    })),
  };
}

export const availabilityService = {
  /**
   * Customer availability for a published hotel. Every number is derived on the server from inventory
   * settings, blocks and reservations. The client's request only chooses the stay; it cannot change stock.
   */
  async search(hotelRef, query, { today: todayOverride } = {}) {
    const { checkIn, checkOut } = query;
    // Per-room occupancy is the model. Legacy totals (rooms/adults/children) are converted to the same shape.
    const occupancy = query.occupancy ?? occupancyFromTotals(query);
    const { rooms, adults, children } = occupancyTotals(occupancy);
    if (checkOut <= checkIn) throw AppError.unprocessable('Check-out must be after check-in');

    const nights = nightsBetween(checkIn, checkOut);
    if (nights.length > MAX_STAY_NIGHTS) throw AppError.unprocessable(`Stays can be at most ${MAX_STAY_NIGHTS} nights`);

    // Drafts, unpublished and archived hotels are simply not found.
    const hotel = await hotelRepository.findById(hotelRef, { publicOnly: true });
    if (!hotel) throw AppError.notFound('Hotel not found');

    // "Today" is the hotel's own calendar date, so a guest is never refused for a date that is today locally.
    const today = todayOverride ?? localToday(hotel.time_zone ?? config.booking.businessTimezone);
    if (checkIn < today) throw AppError.unprocessable('Check-in cannot be in the past');

    const rooms_ = await roomTypeRepository.listForHotel(hotel.id, { publicOnly: true });
    const roomIds = rooms_.map((room) => room.id);
    const base = {
      hotel: { id: hotel.id, slug: hotel.slug, name: hotel.name },
      checkIn,
      checkOut,
      nights: nights.length,
      rooms,
      adults,
      children,
    };
    if (roomIds.length === 0) return { ...base, roomTypes: [] };

    const [nightly, planRows] = await Promise.all([
      loadNightly(pool, roomIds, nights),
      ratePlanRepository.sellablePlansForRoomTypes(roomIds, checkIn, checkOut),
    ]);

    const plansForRoom = new Map();
    for (const plan of planRows) {
      if (!plansForRoom.has(plan.room_type_id)) plansForRoom.set(plan.room_type_id, []);
      plansForRoom.get(plan.room_type_id).push(plan);
    }

    const roomTypes = [];
    for (const room of rooms_) {
      const [amenities, images] = await Promise.all([
        roomTypeRepository.listAmenities(room.id),
        roomTypeRepository.listImages(room.id),
      ]);
      const nightFacts = nights.map((date) => nightly.get(`${room.id}|${date}`));
      // Every room must fit the room type on its own. Rooms are sold as the same type.
      const fits = occupancy.every((guests) =>
        occupancyFits({
          rooms: 1,
          adults: guests.adults,
          children: guests.childAges.length,
          maxAdults: room.max_adults,
          maxChildren: room.max_children,
          maxOccupancy: room.max_occupancy,
        }),
      );
      const availableRooms = Math.min(...nightFacts.map((facts) => facts.sellable));

      const quotes = (plansForRoom.get(room.id) ?? [])
        .map((plan) => {
          const components = priceComponents({
            baseMinor: Number(plan.base_price_minor),
            discountPercent: plan.discount_percent,
            taxPercent: plan.tax_percent,
            feeMinor: plan.fee_minor,
          });
          const nightlyRows = nights.map((date) => ({ date, ...components }));
          const totals = quoteNights(nightlyRows, rooms);
          const policy = toPolicy(plan);
          return {
            ratePlanId: plan.id,
            code: plan.code,
            name: plan.name,
            mealPlan: plan.meal_plan,
            mealPlanName: plan.meal_plan_name ?? null,
            refundable: plan.is_refundable && !(policy?.isNonRefundable ?? false),
            cancellationPolicy: policy,
            currency: plan.currency,
            pricePerNight: totals.averagePerNight,
            ...totals,
            nightly: nightlyRows.map((row) => ({ date: row.date, final: row.final })),
          };
        })
        .sort((a, b) => a.finalAmount - b.finalAmount);

      let unavailableReason = null;
      if (!fits) unavailableReason = 'CAPACITY';
      else if (availableRooms < rooms) unavailableReason = 'SOLD_OUT';
      else if (quotes.length === 0) unavailableReason = 'NO_RATES';

      const available = unavailableReason === null;
      roomTypes.push({
        ...toPublicRoom(room, amenities, images),
        available,
        unavailableReason,
        availableRooms: Math.max(0, availableRooms),
        stayLength: { minNights: null, maxNights: null },
        ratePlans: available ? quotes : [],
      });
    }

    // Sellable rooms first, then by lowest price, so the search page can render the list directly.
    roomTypes.sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      const priceA = a.ratePlans[0]?.finalAmount ?? Infinity;
      const priceB = b.ratePlans[0]?.finalAmount ?? Infinity;
      return priceA - priceB;
    });

    return { ...base, roomTypes };
  },
};
