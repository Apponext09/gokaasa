import { z } from 'zod';
import { parseOccupancy } from '../domain/occupancy.js';

const MEAL_PLANS = ['ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD'];
const BLOCK_REASONS = ['MAINTENANCE', 'OWNER_USE', 'OTHER'];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format').refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Invalid date');
const idParam = z.string().regex(/^\d+$/, 'Invalid id').transform(Number);
const optionalText = (max) => z.string().trim().max(max).nullish().transform((value) => value || null);
const moneyMinor = z.number().int().min(0).max(100_000_000_00);
const percent = z.number().min(0).max(100);

const roomFields = {
  name: z.string().trim().min(2, 'Room name is required').max(120),
  roomCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/, 'Use 2-20 letters, digits, hyphens or underscores'),
  category: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Choose a valid room type'),
  description: optionalText(2000),
  roomSizeSqm: z.number().positive().max(2000).nullish(),
  bedType: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Choose a valid bed type').nullish(),
  bedCount: z.number().int().min(1).max(10),
  maxAdults: z.number().int().min(1).max(20),
  maxChildren: z.number().int().min(0).max(20),
  maxOccupancy: z.number().int().min(1).max(30),
  view: optionalText(60),
  smoking: z.enum(['SMOKING', 'NON_SMOKING']),
  totalUnits: z.number().int().min(0).max(500),
  cancellationPolicyId: z.number().int().positive().nullish(),
};

const occupancyRule = (value, ctx) => {
  if (value.maxOccupancy !== undefined && value.maxAdults !== undefined && value.maxChildren !== undefined) {
    if (value.maxOccupancy < value.maxAdults || value.maxOccupancy > value.maxAdults + value.maxChildren) {
      ctx.addIssue({ code: 'custom', path: ['maxOccupancy'], message: 'Maximum occupancy must be between adults and adults + children' });
    }
  }
};

export const roomTypeCreateSchema = z
  .object({
    ...roomFields,
    roomCode: roomFields.roomCode.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  })
  .superRefine(occupancyRule);

export const roomTypeUpdateSchema = z
  .object({ ...roomFields, status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional() })
  .partial()
  .superRefine(occupancyRule)
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const roomTypeListQuery = z.object({
  includeArchived: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
});

// No defaults here: update schemas are derived with .partial(), and a default would reset omitted fields.
const ratePlanFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Use letters, digits and underscores, starting with a letter'),
  name: z.string().trim().min(2).max(120),
  description: optionalText(1000),
  mealPlan: z.enum(MEAL_PLANS),
  isRefundable: z.boolean(),
  cancellationPolicyId: z.number().int().positive().nullish(),
  discountPercent: percent,
  taxPercent: percent,
  feeMinor: moneyMinor,
  status: z.enum(['ACTIVE', 'INACTIVE']),
};

export const ratePlanCreateSchema = z.object({
  ...ratePlanFields,
  discountPercent: percent.default(0),
  taxPercent: percent.default(0),
  feeMinor: moneyMinor.default(0),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const ratePlanUpdateSchema = z
  .object(ratePlanFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

const policyFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Use letters, digits and underscores'),
  name: z.string().trim().min(2).max(120),
  description: optionalText(500),
  isNonRefundable: z.boolean(),
  cancellationDeadlineHours: z.number().int().min(0).max(24 * 365).nullish(),
  refundPercent: z.number().int().min(0).max(100),
};

function policyRule(value, ctx) {
  if (value.isNonRefundable === true && (value.refundPercent !== 0 || value.cancellationDeadlineHours != null)) {
    ctx.addIssue({ code: 'custom', path: ['isNonRefundable'], message: 'A non-refundable policy has no deadline and refunds nothing' });
  }
  if (value.isNonRefundable === false && value.refundPercent > 0 && value.cancellationDeadlineHours == null) {
    ctx.addIssue({ code: 'custom', path: ['cancellationDeadlineHours'], message: 'Set the deadline before which the refund applies' });
  }
}

export const policyCreateSchema = z.object({ ...policyFields, status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE') }).superRefine(policyRule);

export const policyUpdateSchema = z
  .object({ ...policyFields, status: z.enum(['ACTIVE', 'INACTIVE']).optional() })
  .partial()
  .superRefine(policyRule)
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

const nullableInt = z.number().int().min(1).max(365).nullish();

export const bulkCalendarSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    ratePlanId: z.number().int().positive().optional(),
    basePriceMinor: moneyMinor.nullish(),
    units: z.number().int().min(0).max(500).nullish(),
    isClosed: z.boolean().optional(),
    minStay: nullableInt,
    maxStay: nullableInt,
  })
  .refine((value) => value.to >= value.from, { path: ['to'], message: 'End date must be on or after the start date' })
  .refine((value) => value.basePriceMinor === undefined || value.ratePlanId !== undefined, {
    path: ['ratePlanId'],
    message: 'Choose a rate plan to set its price',
  })
  .refine((value) => value.minStay == null || value.maxStay == null || value.maxStay >= value.minStay, {
    path: ['maxStay'],
    message: 'Maximum stay cannot be shorter than minimum stay',
  });

export const calendarQuery = z
  .object({ from: isoDate, to: isoDate, ratePlanId: z.coerce.number().int().positive().optional() })
  .refine((value) => value.to >= value.from, { path: ['to'], message: 'End date must be on or after the start date' });

export const blockCreateSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    quantity: z.number().int().min(1).max(500),
    reason: z.enum(BLOCK_REASONS),
    note: optionalText(300),
  })
  .refine((value) => value.endDate > value.startDate, { path: ['endDate'], message: 'The block must cover at least one night' });

// Either the per-room occupancy string (occ, e.g. "2-7.12|1") or the legacy totals may be sent.
export const availabilityQuery = z
  .object({
    checkIn: isoDate,
    checkOut: isoDate,
    occ: z.string().max(200).optional(),
    rooms: z.coerce.number().int().min(1).max(10).default(1),
    adults: z.coerce.number().int().min(1).max(40).default(2),
    children: z.coerce.number().int().min(0).max(20).default(0),
  })
  .refine((value) => value.checkOut > value.checkIn, { path: ['checkOut'], message: 'Check-out must be after check-in' })
  .transform((value, ctx) => {
    if (value.occ === undefined) return { checkIn: value.checkIn, checkOut: value.checkOut, ...value, occupancy: undefined };
    try {
      return { checkIn: value.checkIn, checkOut: value.checkOut, occupancy: parseOccupancy(value.occ) };
    } catch (error) {
      ctx.addIssue({ code: 'custom', path: ['occ'], message: error.message });
      return z.NEVER;
    }
  });

export const roomImageReorderSchema = z.object({
  imageIds: z.array(z.number().int().positive()).min(1).max(15),
});

export const roomParam = z.object({ id: idParam });
export const roomImageParam = z.object({ id: idParam, imageId: idParam });
export const policyParam = z.object({ id: idParam });
export const blockParam = z.object({ id: idParam });
