import { z } from 'zod';

const positiveId = z.coerce.number().int().positive();
const pagination = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };
const isoDateTime = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional();

export const adminUserIdParam = z.object({ id: positiveId });
export const adminUserSessionParam = z.object({ id: positiveId, sessionId: positiveId });

export const adminUserListQuery = z.object({
  ...pagination,
  q: z.string().trim().max(100).optional(),
  role: z.enum(['CUSTOMER', 'ADMIN', 'HOTEL_MANAGER', 'HOTEL_OWNER']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  online: z.enum(['online', 'offline']).optional(),
  from: isoDateTime,
  to: isoDateTime,
  lastActivityFrom: isoDateTime,
  lastActivityTo: isoDateTime,
  sort: z.enum(['created_desc', 'created_asc', 'last_activity_desc', 'name_asc']).default('created_desc'),
});

export const adminUserStatusSchema = z.object({ isActive: z.boolean() });
