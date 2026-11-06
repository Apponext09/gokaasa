import { z } from 'zod';

const positiveId = z.coerce.number().int().positive();
const pagination = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };
// Bare calendar dates only -- matches adminBooking.validator.js's auditLogQuery convention exactly, since
// every preset here (Today/Last 7 days/This month/Custom range) is day-granular. The listing and detail
// endpoints share this one schema so a date range means the same thing, with the same boundaries, on both.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format').optional();

export const employeeIdParam = z.object({ id: positiveId });

const dateRange = { from: isoDate, to: isoDate };

export const employeePerformanceListQuery = z.object({
  ...pagination,
  ...dateRange,
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['onboarded_desc', 'edited_desc', 'name_asc']).default('onboarded_desc'),
});

export const employeeActivityQuery = z.object({
  ...pagination,
  ...dateRange,
});

export const monthlyTrendsQuery = z.object({
  months: z.coerce.number().int().min(1).max(24).default(12),
});

export const hotelActivityHistoryQuery = z.object(pagination);
