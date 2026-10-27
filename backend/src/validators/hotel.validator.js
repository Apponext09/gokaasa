import { z } from 'zod';

export const HOTEL_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'READY_TO_PUBLISH', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'];
export const HOTEL_ACTIONS = ['SAVE_DRAFT', 'SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH', 'UNPUBLISH', 'ARCHIVE'];
export const SORT_KEYS = ['updated_desc', 'name_asc', 'rating_desc', 'star_desc', 'created_desc'];

const text = (max) => z.string().trim().max(max);
const optionalText = (max) => text(max).nullish().transform((value) => value || null);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time such as 14:00').nullish();
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number')
  .nullish()
  .transform((value) => value || null);
const webUrl = (label, max = 1000) => z
  .url(`${label} must be a valid URL`)
  .max(max)
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), `${label} must use http or https`)
  .nullish()
  .transform((value) => value || null);

const hotelFields = {
  name: z.string().trim().min(2, 'Hotel name is required').max(200),
  shortName: optionalText(60),
  description: optionalText(4000),
  propertyType: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Choose a valid property type'),
  starRating: z.number().int().min(1).max(5).nullish(),
  addressLine: optionalText(300),
  area: optionalText(120),
  city: z.string().trim().min(2, 'City is required').max(100),
  state: optionalText(120),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a two-letter country code such as IN'),
  postalCode: optionalText(20),
  locationUrl: webUrl('Location URL'),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  phone,
  email: z.email().max(254).nullish().transform((value) => value?.toLowerCase() || null),
  website: webUrl('Website', 500),
  checkInTime: time,
  checkOutTime: time,
};

export const hotelCreateSchema = z.object({
  ...hotelFields,
  propertyType: hotelFields.propertyType.default('HOTEL'),
});

export const hotelUpdateSchema = z
  .object(hotelFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const hotelStatusSchema = z.object({
  action: z.enum(HOTEL_ACTIONS),
  feedback: z.string().trim().min(3).max(1000).optional(),
});

export const hotelAmenitiesSchema = z.object({
  codes: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).max(100),
});

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};

export const adminHotelListQuery = z.object({
  ...pagination,
  q: z.string().trim().max(100).optional(),
  status: z.enum(HOTEL_STATUSES).optional(),
  city: z.string().trim().max(100).optional(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  starRating: z.coerce.number().int().min(1).max(5).optional(),
  propertyType: hotelFields.propertyType.optional(),
  managerId: z.coerce.number().int().positive().optional(),
  sort: z.enum(SORT_KEYS).default('updated_desc'),
});

export const publicHotelListQuery = adminHotelListQuery.omit({ status: true, managerId: true });

export const idParam = z.object({
  id: z.string().regex(/^\d+$/, 'Invalid id').transform(Number),
});

export const hotelRefParam = z.object({
  idOrSlug: z.string().min(1).max(160).regex(/^[a-z0-9-]+$|^\d+$/i, 'Invalid hotel reference'),
});
