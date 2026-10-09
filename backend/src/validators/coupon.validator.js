import { z } from 'zod';

const positiveId = z.coerce.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format');
const isoDateTime = z.coerce.date();
const pagination = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };

export const couponIdParam = z.object({ id: positiveId });

export const couponListQuery = z.object({
  ...pagination,
  q: z.string().trim().max(40).optional(),
  isActive: z.coerce.boolean().optional(),
});

const baseFields = {
  code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, hyphens and underscores only'),
  discountType: z.enum(['PERCENT', 'FIXED']),
  discountValue: z.number().int().positive(),
  maxDiscountMinor: z.number().int().nonnegative().nullable().optional(),
  minAmountMinor: z.number().int().nonnegative().default(0),
  validFrom: isoDateTime,
  validTo: isoDateTime,
  usageLimit: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().positive().nullable().optional(),
  minNights: z.number().int().positive().nullable().optional(),
  customerEligibility: z.enum(['ALL', 'NEW_CUSTOMERS']).default('ALL'),
  stayFrom: isoDate.nullable().optional(),
  stayTo: isoDate.nullable().optional(),
  description: z.string().trim().max(300).nullable().optional(),
  hotelIds: z.array(positiveId).max(200).optional(),
  cities: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
};

function refine(schema) {
  return schema
    .refine((v) => v.validTo > v.validFrom, { path: ['validTo'], message: 'End date must be after the start date' })
    .refine((v) => v.discountType !== 'PERCENT' || v.discountValue <= 100, { path: ['discountValue'], message: 'A percentage discount cannot exceed 100' })
    .refine((v) => v.stayFrom == null || v.stayTo == null || v.stayTo >= v.stayFrom, { path: ['stayTo'], message: 'End date must be on or after the start date' });
}

export const couponCreateSchema = refine(z.object(baseFields));

export const couponUpdateSchema = z
  .object(Object.fromEntries(Object.entries(baseFields).map(([key, schema]) => [key, schema.optional()])))
  .refine((v) => v.validFrom == null || v.validTo == null || v.validTo > v.validFrom, { path: ['validTo'], message: 'End date must be after the start date' })
  .refine((v) => v.discountType !== 'PERCENT' || v.discountValue == null || v.discountValue <= 100, { path: ['discountValue'], message: 'A percentage discount cannot exceed 100' });

export const couponStatusSchema = z.object({ isActive: z.boolean() });
