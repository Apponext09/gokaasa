import { z } from 'zod';
import { LIMITS } from '../domain/occupancy.js';
import { MAX_STAY_NIGHTS, nightsBetween, parseDate } from '../domain/pricing.js';

const positiveId = z.coerce.number().int().positive();

const dateString = (label) =>
  z
    .string({ error: `${label} is required` })
    .refine((value) => parseDate(value) !== null, { message: `${label} must be a valid date (YYYY-MM-DD)` });

const occupancyRoom = z.object({
  adults: z.number().int().min(LIMITS.minAdults).max(LIMITS.maxAdults),
  childAges: z
    .array(z.number().int().min(LIMITS.minAge).max(LIMITS.maxAge))
    .max(LIMITS.maxChildrenPerRoom)
    .default([]),
});

export const occupancySchema = z.array(occupancyRoom).min(1).max(LIMITS.maxRooms);

const stayFields = {
  checkIn: dateString('Check-in'),
  checkOut: dateString('Check-out'),
  occupancy: occupancySchema,
};

/** Checks that apply to every stay: order of dates, length of stay. "Not in the past" is checked against the hotel's time zone in the service. */
function refineStay(value, ctx) {
  if (value.checkIn && value.checkOut) {
    if (value.checkOut <= value.checkIn) {
      ctx.addIssue({ code: 'custom', path: ['checkOut'], message: 'Check-out must be after check-in' });
      return;
    }
    if (nightsBetween(value.checkIn, value.checkOut).length > MAX_STAY_NIGHTS) {
      ctx.addIssue({ code: 'custom', path: ['checkOut'], message: `Stays can be at most ${MAX_STAY_NIGHTS} nights` });
    }
  }
}

export const holdCreateSchema = z
  .object({
    hotelId: positiveId,
    roomTypeId: positiveId,
    ratePlanId: positiveId,
    rooms: z.number().int().min(1).max(LIMITS.maxRooms),
    idempotencyKey: z.string().trim().min(1).max(100).optional(),
    ...stayFields,
  })
  .superRefine((value, ctx) => {
    refineStay(value, ctx);
    if (value.occupancy && value.rooms !== value.occupancy.length) {
      ctx.addIssue({ code: 'custom', path: ['rooms'], message: 'The number of rooms must match the occupancy list' });
    }
  });

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const personName = (label) =>
  z.string().trim().min(1, `${label} is required`).max(60, `${label} must be at most 60 characters`);

export const guestDetailsSchema = z.object({
  primaryContact: z.object({
    firstName: personName('First name'),
    lastName: personName('Last name'),
    email: z.preprocess((value) => (typeof value === 'string' ? value.trim().toLowerCase() : value), z.email('Enter a valid email address')),
    mobile: z.preprocess(
      (value) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value),
      z.string().regex(/^\+?[0-9]{10,15}$/, 'Enter a valid mobile number'),
    ),
  }),
  rooms: z
    .array(
      z.object({
        roomIndex: z.number().int().min(0),
        guests: z
          .array(
            z.object({
              firstName: personName('First name'),
              lastName: personName('Last name'),
              age: z.number().int().min(0, 'Age must be 0 or more').max(120, 'Age must be 120 or less'),
            }),
          )
          .min(1, 'Add the guests for this room'),
      }),
    )
    .min(1),
  gstNumber: z
    .preprocess(
      (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
      z.string().regex(/^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN').optional(),
    )
    .transform((value) => (value ? value : undefined)),
  companyName: optionalText(120),
  billingAddress: optionalText(300),
  specialRequest: optionalText(500),
});

export const holdIdParam = z.object({ id: positiveId });

export const bookingIdParam = z.object({ id: positiveId });

export const paymentIdParam = z.object({ id: positiveId });

export const refundIdParam = z.object({ id: positiveId });

export const createOrderSchema = z.object({ holdId: positiveId });

export const verifySchema = z.object({
  razorpay_order_id: z.string().min(3).max(100),
  razorpay_payment_id: z.string().min(3).max(100),
  razorpay_signature: z.string().min(10).max(256),
});

export const failedPaymentSchema = z.object({
  razorpayOrderId: z.string().min(3).max(100),
  reason: z.string().trim().max(200).optional(),
});

export const devCheckoutSchema = z.object({
  razorpayOrderId: z.string().min(3).max(100),
  outcome: z.enum(['success', 'failure']),
});

export const myBookingsQuery = z.object({
  tab: z.enum(['upcoming', 'completed', 'cancelled']).default('upcoming'),
});

export const cancelSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});
