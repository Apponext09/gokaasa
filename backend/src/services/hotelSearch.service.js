import { hotelSearchRepository } from '../repositories/hotelSearch.repository.js';
import { destinationRepository } from '../repositories/destination.repository.js';
import { getStorage } from '../storage/index.js';
import { describePolicy } from '../domain/cancellationPolicy.js';
import { nightsBetween } from '../domain/pricing.js';
import { localToday } from '../domain/businessDate.js';
import { config } from '../config/index.js';
import { toPage } from './presenters.js';
import { AppError } from '../utils/AppError.js';

/** "Taj Lands End Mumbai" -> "taj-lands-end-mumbai". The same rule is used for URLs and for matching. */
export function slugifyPlace(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
export const countryName = (code) => {
  try {
    return code ? regionNames.of(code) : null;
  } catch {
    return code;
  }
};

/** Resolves a destination slug to the exact city names stored on hotels. Unknown slugs match nothing. */
async function resolveNames(slug, field) {
  if (!slug) return null;
  const places = await destinationRepository.publishedPlaces();
  const names = new Set();
  for (const place of places) {
    const value = place[field];
    if (value && slugifyPlace(value) === slug) names.add(value.toLowerCase());
  }
  return [...names];
}

function imageFor(cover) {
  if (!cover) return null;
  const url = cover.storageKey ? getStorage().publicUrl(cover.storageKey) : cover.sourceUrl;
  return url ? { url, altText: cover.altText ?? null } : null;
}

/** One hotel card. Every figure comes from the database; nothing is estimated or invented. */
export function toHotelCard(row) {
  const nights = row.nights;
  const freeCancellation = Boolean(row.is_refundable && !row.is_non_refundable && row.refund_percent === 100);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    area: row.area,
    countryCode: row.country_code,
    country: countryName(row.country_code),
    propertyType: row.property_type,
    starRating: row.star_rating,
    guestRating: row.guest_rating == null ? null : Number(row.guest_rating),
    reviewCount: row.review_count,
    image: imageFor(row.cover),
    amenities: row.top_amenities ?? [],
    wishlisted: Boolean(row.wishlisted),
    bestOffer: {
      roomTypeId: row.room_type_id,
      roomName: row.room_name,
      roomCode: row.room_code,
      bedType: row.bed_type,
      roomSizeSqm: row.room_size_sqm == null ? null : Number(row.room_size_sqm),
      view: row.view,
      ratePlanId: row.plan_id,
      ratePlanName: row.plan_name,
      mealPlan: row.meal_plan,
      refundable: row.is_refundable && !row.is_non_refundable,
      freeCancellation,
      cancellationSummary: describePolicy({
        is_non_refundable: row.is_non_refundable,
        cancellation_deadline_hours: row.cancellation_deadline_hours,
        refund_percent: row.refund_percent,
      }),
      nights,
      pricePerNightMinor: Number(row.per_night),
      baseTotalMinor: Number(row.base_total),
      discountTotalMinor: Number(row.discount_total),
      taxTotalMinor: Number(row.tax_total),
      feeTotalMinor: Number(row.fee_total),
      finalTotalMinor: Number(row.final_total),
      roomsLeft: row.rooms_left,
    },
  };
}

export const hotelSearchService = {
  /** Other published hotels in the same city. Light cards only: no room offer is implied. */
  async similar(hotel) {
    const rows = await hotelSearchRepository.similar({ hotelId: hotel.id, city: hotel.city, limit: 4 });
    return rows.map((row) => {
      const card = toHotelCard({ ...row, nights: 0 });
      delete card.bestOffer;
      return card;
    });
  },

  /**
   * Searches published hotels with a bookable room for the stay and occupancy. Returns one card per hotel
   * with its cheapest bookable option, plus the price bounds of the unfiltered set for the price slider.
   */
  async search(query, { userId = null, today = localToday(config.booking.businessTimezone) } = {}) {
    const { checkIn, checkOut, occupancy, page, limit, filters, sort } = query;
    if (checkIn < today) throw AppError.unprocessable('Check-in cannot be in the past', [{ field: 'checkIn', message: 'Pick a date from today onwards' }]);

    const nights = nightsBetween(checkIn, checkOut);
    const cities = await resolveNames(query.destination, 'city');
    const areas = await resolveNames(query.area, 'area');

    const rows = await hotelSearchRepository.search({
      cities,
      areas,
      nights,
      occupancy: occupancy.map((room) => ({ adults: room.adults, childCount: room.childAges.length })),
      filters: {
        stars: filters.stars ?? null,
        guestRatingMin: filters.guestRating ?? null,
        propertyTypes: filters.propertyTypes ?? null,
        amenities: filters.amenities ?? null,
        freeCancellation: filters.freeCancellation ?? false,
        mealPlans: filters.mealPlans ?? null,
        // Prices arrive in rupees per room per night; the database compares paise.
        minPerNight: filters.minPrice == null ? null : filters.minPrice * 100,
        maxPerNight: filters.maxPrice == null ? null : filters.maxPrice * 100,
      },
      sort,
      limit,
      offset: (page - 1) * limit,
      userId,
    });

    const total = rows[0]?.total_count ?? 0;
    const items = rows.map((row) => toHotelCard({ ...row, nights: nights.length }));
    const priceBounds = rows[0]?.price_floor == null
      ? null
      : { minPerNightMinor: Number(rows[0].price_floor), maxPerNightMinor: Number(rows[0].price_ceiling) };

    return {
      search: {
        destination: query.destination ?? null,
        area: query.area ?? null,
        checkIn,
        checkOut,
        nights: nights.length,
        rooms: occupancy.length,
        occupancy: occupancy.map((room) => ({ adults: room.adults, childAges: room.childAges })),
        sort,
        filters,
      },
      ...toPage(items, total, page, limit),
      priceBounds,
    };
  },

  /** Destination suggestions for the search box. The caller debounces; this only answers one request. */
  async suggest(text) {
    const rows = await destinationRepository.suggest(text);
    return {
      items: rows.map((row) => {
        const citySlug = slugifyPlace(row.city);
        if (row.type === 'CITY') {
          return { type: 'CITY', label: row.label, subtitle: `City · ${countryName(row.country_code) ?? row.country_code}`, destination: citySlug, hotelCount: row.hotel_count };
        }
        if (row.type === 'AREA') {
          return { type: 'AREA', label: row.label, subtitle: `Area · ${row.city}`, destination: citySlug, area: slugifyPlace(row.label), hotelCount: row.hotel_count };
        }
        return { type: 'HOTEL', label: row.label, subtitle: `Hotel · ${row.city}`, destination: citySlug, hotelSlug: row.slug };
      }),
    };
  },

  async popular() {
    const rows = await destinationRepository.popularCities();
    return {
      items: rows.map((row) => ({
        label: row.city,
        destination: slugifyPlace(row.city),
        country: countryName(row.country_code),
        hotelCount: row.hotel_count,
      })),
    };
  },
};
