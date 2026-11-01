import { z } from 'zod';

const positiveId = z.coerce.number().int().positive();
const pagination = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };
const isoDateTime = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional();

export const adminUserIdParam = z.object({ id: positiveId });
export const adminUserSessionParam = z.object({ id: positiveId, sessionId: positiveId });

export const adminUserListQuery = z.object({
  ...pagination,
  q: z.string().trim().max(100).optional(),
  role: z.enum(['CUSTOMER', 'ADMIN', 'HOTEL_OWNER', 'SALES_EXECUTIVE', 'HOTEL_ONBOARDING_EXECUTIVE', 'HOTEL_REVIEW_EXECUTIVE']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  online: z.enum(['online', 'offline']).optional(),
  from: isoDateTime,
  to: isoDateTime,
  lastActivityFrom: isoDateTime,
  lastActivityTo: isoDateTime,
  sort: z.enum(['created_desc', 'created_asc', 'last_activity_desc', 'name_asc']).default('created_desc'),
});

export const adminUserStatusSchema = z.object({ isActive: z.boolean() });

const staffPassword = z.string().min(10).max(128).regex(/[a-zA-Z]/, 'Password must include a letter').regex(/[0-9]/, 'Password must include a number');
const staffName = z.string().trim().min(1).max(80).regex(/^[\p{L}\p{M}' .-]+$/u, 'Name contains invalid characters');

export const adminStaffCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: staffPassword,
  firstName: staffName,
  lastName: staffName,
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number').optional().or(z.literal('').transform(() => undefined)),
  role: z.enum(['SALES_EXECUTIVE', 'HOTEL_ONBOARDING_EXECUTIVE', 'HOTEL_REVIEW_EXECUTIVE']),
});
