import { hotelSearchRepository } from '../repositories/hotelSearch.repository.js';
import { destinationRepository } from '../repositories/destination.repository.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { couponRepository } from '../repositories/coupon.repository.js';
import { getStorage } from '../storage/index.js';
import { describePolicy } from '../domain/cancellationPolicy.js';
import { addDays, nightsBetween } from '../domain/pricing.js';
import { localToday } from '../domain/businessDate.js';
import { LIVE_BOOKING_STATUSES } from '../domain/bookingStatus.js';
import { bestDisplayOffer } from '../domain/coupon.js';
import { config } from '../config/index.js';
import { toPage } from './presenters.js';
import { AppError } from '../utils/AppError.js';

/**
 * Every active, in-date coupon with its hotel/city restrictions attached, fetched once per request (not
 * once per hotel) -- the same batched pattern couponRepository.restrictionsFor already uses for the
 * public /api/offers list. Feeds bestDisplayOffer() for every card in the result set.
 */
async function offersForBadges() {
  const coupons = await couponRepository.listActive();
  if (coupons.length === 0) return [];
  const { hotelsByCoupon, citiesByCoupon } = await couponRepository.restrictionsFor(coupons.map((c) => c.id));
  return coupons.map((c) => ({
    ...c,
    hotel_ids: (hotelsByCoupon.get(c.id) ?? []).map((h) => h.id),
    cities: citiesByCoupon.get(c.id) ?? [],
  }));
}

/** The computed badge saving for a card, or null. `row` must carry id/city and the price fields named. */
function offerBadgeFor(row, offers, { subtotalMinor, nights = null, checkIn = null, checkOut = null }) {
  if (!offers.length) return null;
  const best = bestDisplayOffer(offers, { subtotalMinor, hotelId: row.id, city: row.city, nights, checkIn, checkOut });
  return best ? { code: best.code, discountMinor: best.discountMinor, discountPercent: best.discountPercent } : null;
}

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
  return url ? { url, altText: cover.altText ?? null, isIllustrative: cover.imageType === 'ILLUSTRATIVE' } : null;
}

/** One hotel card. Every figure comes from the database; nothing is estimated or invented. */
export function toHotelCard(row, { offers = [], checkIn = null, checkOut = null } = {}) {
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
    distanceKm: row.distance_km == null ? null : Number(row.distance_km),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    propertyType: row.property_type,
    starRating: row.star_rating,
    guestRating: row.guest_rating == null ? null : Number(row.guest_rating),
    reviewCount: row.review_count,
    // Gokaasa's own guest-review aggregate (APPROVED only). Separate from guestRating/reviewCount above,
    // which are provider-sourced and still drive sort=guest_rating / the guestRating filter untouched.
    rating: row.internal_rating?.count > 0 ? { average: Number(row.internal_rating.average), count: row.internal_rating.count } : null,
    image: imageFor(row.cover),
    amenities: row.top_amenities ?? [],
    wishlisted: Boolean(row.wishlisted),
    // The admin coupon/offer system's best generally-available discount for this hotel at this real
    // price -- see domain/coupon.js#bestDisplayOffer. null when nothing safely qualifies.
    offer: row.final_total != null ? offerBadgeFor(row, offers, { subtotalMinor: Number(row.final_total), nights, checkIn, checkOut }) : null,
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

/**
 * A homepage hotel teaser: no stay/occupancy context, so no bestOffer/cancellation -- just enough to
 * decide whether to tap through. `distanceKm` is null for a handpicked (non-geo) card.
 */
function toCuratedCard(row, { offers = [] } = {}) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    area: row.area,
    countryCode: row.country_code,
    country: countryName(row.country_code),
    starRating: row.star_rating,
    guestRating: row.guest_rating == null ? null : Number(row.guest_rating),
    reviewCount: row.review_count,
    rating: row.internal_rating?.count > 0 ? { average: Number(row.internal_rating.average), count: row.internal_rating.count } : null,
    distanceKm: row.distance_km == null ? null : Number(row.distance_km),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    image: imageFor(row.cover),
    amenities: row.top_amenities ?? [],
    wishlisted: Boolean(row.wishlisted),
    // No stay context exists yet on a homepage teaser, so bestDisplayOffer only considers coupons with no
    // min-nights/stay-date restriction -- see its own doc comment for the full, deliberately conservative rule.
    offer: row.final_price_minor == null ? null : offerBadgeFor(row, offers, { subtotalMinor: Number(row.final_price_minor) }),
    price: row.final_price_minor == null
      ? null
      : {
        amountMinor: Number(row.final_price_minor),
        originalAmountMinor: row.discount_minor > 0 ? Number(row.base_price_minor) : null,
        discountPercent: row.discount_minor > 0 ? Math.round((Number(row.discount_minor) / Number(row.base_price_minor)) * 100) : null,
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
    const offers = await offersForBadges();
    const items = rows.map((row) => toHotelCard({ ...row, nights: nights.length }, { offers, checkIn, checkOut }));
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

  /**
   * Published hotels within `radiusKm` of a point the browser's geolocation API reported, nearest first.
   * Distance and the candidate shortlist are computed entirely in SQL (a bounding box on the existing
   * lat/lng index, then an exact haversine distance) -- nothing is fetched into Node to filter here.
   */
  async nearby(query, { userId = null } = {}) {
    const { lat, lng, radiusKm, page, limit } = query;
    const referenceDate = addDays(localToday(config.booking.businessTimezone), 1);
    const [{ rows, total }, offers] = await Promise.all([
      hotelSearchRepository.curated({ lat, lng, radiusKm, referenceDate, userId, limit, offset: (page - 1) * limit }),
      offersForBadges(),
    ]);
    return toPage(rows.map((row) => toCuratedCard(row, { offers })), total, page, limit);
  },

  /** The same teaser shape as `nearby`, but every published hotel is a candidate, ranked by rating. */
  async handpicked(query, { userId = null } = {}) {
    const { page, limit } = query;
    const referenceDate = addDays(localToday(config.booking.businessTimezone), 1);
    const [{ rows, total }, offers] = await Promise.all([
      hotelSearchRepository.curated({ referenceDate, userId, limit, offset: (page - 1) * limit }),
      offersForBadges(),
    ]);
    return toPage(rows.map((row) => toCuratedCard(row, { offers })), total, page, limit);
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

  async popular(limit = 6) {
    const rows = await destinationRepository.popularCities(limit);
    return {
      items: rows.map((row) => ({
        label: row.city,
        destination: slugifyPlace(row.city),
        country: countryName(row.country_code),
        hotelCount: row.hotel_count,
        imageUrl: imageFor(row.cover)?.url ?? null,
      })),
    };
  },

  async stayTypes(limit = 6) {
    const rows = await destinationRepository.popularPropertyTypes(limit);
    return {
      items: rows.map((row) => ({
        value: row.property_type,
        label: row.property_type
          .toLowerCase()
          .split('_')
          .map((word) => word[0].toUpperCase() + word.slice(1))
          .join(' '),
        hotelCount: row.hotel_count,
        imageUrl: imageFor(row.cover)?.url ?? null,
      })),
    };
  },

  /** Public trust-strip counts for the homepage. Published/confirmed figures only, never revenue or PII. */
  async stats() {
    const [hotelCounts, bookingCounts, coverage] = await Promise.all([
      hotelRepository.countByStatus(),
      bookingRepository.countByStatus(),
      destinationRepository.coverage(),
    ]);
    const confirmedBookings = LIVE_BOOKING_STATUSES.reduce((sum, status) => sum + (bookingCounts[status] ?? 0), 0);
    return {
      hotels: { published: hotelCounts.PUBLISHED ?? 0 },
      bookings: { confirmed: confirmedBookings },
      destinations: { cities: coverage.cities, countries: coverage.countries },
    };
  },
};
