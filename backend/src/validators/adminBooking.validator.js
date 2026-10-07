import { z } from 'zod';

const positiveId = z.coerce.number().int().positive();
const pagination = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format');

const BOOKING_STATUSES = ['INITIATED', 'PAYMENT_PENDING', 'PAID', 'CONFIRMED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'FAILED', 'EXPIRED'];
const PAYMENT_STATUSES = ['CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'];
const REFUND_STATUSES = ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'];

export const adminBookingIdParam = z.object({ id: positiveId });
export const adminCustomerIdParam = z.object({ id: positiveId });

export const adminBookingListQuery = z.object({
  ...pagination,
  q: z.string().trim().max(100).optional(),
  hotelId: positiveId.optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(['created_desc', 'created_asc', 'check_in_asc', 'amount_desc']).default('created_desc'),
});

export const adminPaymentListQuery = z.object({
  ...pagination,
  status: z.enum(PAYMENT_STATUSES).optional(),
  hotelId: positiveId.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const adminRefundListQuery = z.object({
  ...pagination,
  status: z.enum(REFUND_STATUSES).optional(),
  hotelId: positiveId.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const adminCustomerListQuery = z.object({
  ...pagination,
  q: z.string().trim().max(100).optional(),
});

export const auditLogQuery = z.object({
  ...pagination,
  entity: z.string().trim().max(60).optional(),
  action: z.string().trim().max(80).optional(),
  actorId: positiveId.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const dashboardTrendsQuery = z
  .object({ from: isoDate, to: isoDate })
  .refine((value) => value.to >= value.from, { path: ['to'], message: 'End date must be on or after the start date' });
