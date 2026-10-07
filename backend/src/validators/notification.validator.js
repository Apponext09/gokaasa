import { z } from 'zod';

export const notificationListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const notificationIdParam = z.object({
  id: z.coerce.number().int().positive(),
});
