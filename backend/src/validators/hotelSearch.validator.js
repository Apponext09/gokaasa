import { z } from 'zod';
import { parseOccupancy, OccupancyError, DEFAULT_OCCUPANCY } from '../domain/occupancy.js';
import { MAX_STAY_NIGHTS, parseDate, daysBetween } from '../domain/pricing.js';

const SORTS = ['recommended', 'price_asc', 'price_desc', 'guest_rating', 'star_rating'];
const MEAL_PLANS = ['ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD'];
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use a valid place name');

const isoDate = z
  .string()
  .refine((value) => parseDate(value) !== null, 'Use a real date in YYYY-MM-DD format');

/** "1,2,3" -> ["1","2","3"]; empty and missing values become undefined. */
const csv = (item) =>
  z
    .string()
    .max(300)
    .optional()
    .transform((value) => (value ? [...new Set(value.split(',').map((part) => part.trim()).filter(Boolean))] : undefined))
    .pipe(z.array(item).optional());

/**
 * Validates every public search parameter. Anything unexpected is rejected with a field-level error instead of
 * silently ignored, so a shared URL always means what it says.
 */
export const hotelSearchQuery = z
  .object({
    destination: slug.optional(),
    area: slug.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    checkIn: isoDate,
    checkOut: isoDate,
    occ: z.string().max(300).optional(),
    sort: z.enum(SORTS).default('recommended'),
    page: z.coerce.number().int().min(1, 'Page starts at 1').max(500).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    minPrice: z.coerce.number().int().min(0).max(1_000_000).optional(),
    maxPrice: z.coerce.number().int().min(0).max(1_000_000).optional(),
    stars: csv(z.enum(['1', '2', '3', '4', '5'])),
    guestRating: z.coerce.number().min(0).max(5).optional(),
    propertyTypes: csv(z.enum(['HOTEL', 'RESORT', 'VILLA', 'APARTMENT', 'HOSTEL', 'GUEST_HOUSE'])),
    amenities: csv(z.string().regex(/^[A-Z][A-Z0-9_]{1,40}$/, 'Unknown amenity')),
    freeCancellation: z.enum(['true', 'false']).optional(),
    mealPlans: csv(z.enum(MEAL_PLANS)),
  })
  .superRefine((value, ctx) => {
    if (value.checkOut <= value.checkIn) {
      ctx.addIssue({ code: 'custom', path: ['checkOut'], message: 'Check-out must be after check-in' });
      return;
    }
    const nights = daysBetween(value.checkIn, value.checkOut);
    if (nights > MAX_STAY_NIGHTS) {
      ctx.addIssue({ code: 'custom', path: ['checkOut'], message: `Stays can be at most ${MAX_STAY_NIGHTS} nights` });
    }
    if (value.minPrice != null && value.maxPrice != null && value.maxPrice < value.minPrice) {
      ctx.addIssue({ code: 'custom', path: ['maxPrice'], message: 'Maximum price must be at least the minimum' });
    }
  })
  .transform((value, ctx) => {
    let occupancy = DEFAULT_OCCUPANCY.map((room) => ({ ...room, childAges: [] }));
    try {
      occupancy = parseOccupancy(value.occ);
    } catch (error) {
      if (!(error instanceof OccupancyError)) throw error;
      ctx.addIssue({ code: 'custom', path: ['occ'], message: error.message });
      return z.NEVER;
    }
    return {
      destination: value.destination,
      area: value.area,
      name: value.name,
      checkIn: value.checkIn,
      checkOut: value.checkOut,
      occupancy,
      sort: value.sort,
      page: value.page,
      limit: value.limit,
      filters: {
        stars: value.stars?.map(Number),
        guestRating: value.guestRating,
        propertyTypes: value.propertyTypes,
        amenities: value.amenities,
        freeCancellation: value.freeCancellation === 'true',
        mealPlans: value.mealPlans,
        minPrice: value.minPrice,
        maxPrice: value.maxPrice,
      },
    };
  });

export const destinationSuggestQuery = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(60),
});

export const popularDestinationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(6),
});

/** A hotel teaser card for the homepage: no stay/occupancy context, so no cancellation policy or room detail. */
export const nearbyHotelsQuery = z.object({
  lat: z.coerce.number().min(-90, 'Invalid latitude').max(90, 'Invalid latitude'),
  lng: z.coerce.number().min(-180, 'Invalid longitude').max(180, 'Invalid longitude'),
  radiusKm: z.coerce.number().positive('Radius must be positive').max(100, 'Radius can be at most 100km').default(25),
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(24).default(8),
});

export const handpickedHotelsQuery = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(24).default(10),
});
