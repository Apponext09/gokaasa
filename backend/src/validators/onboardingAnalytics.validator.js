import { z } from 'zod';

const positiveId = z.coerce.number().int().positive();
const pagination = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };
// Accepts either a bare date or a full offset timestamp, matching adminUser.validator.js's isoDateTime --
// the "Today/Last 7 days/This month/Custom range" presets resolve to either shape client-side.
const isoDateTime = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional();

export const employeeIdParam = z.object({ id: positiveId });

export const employeePerformanceListQuery = z.object({
  ...pagination,
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['onboarded_desc', 'edited_desc', 'name_asc']).default('onboarded_desc'),
});

export const employeeActivityQuery = z.object({
  ...pagination,
  from: isoDateTime,
  to: isoDateTime,
});

export const monthlyTrendsQuery = z.object({
  months: z.coerce.number().int().min(1).max(24).default(12),
});

export const hotelActivityHistoryQuery = z.object(pagination);
