import { z } from 'zod';

export const managerAssignSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export const managerListQuery = z.object({
  q: z.string().trim().max(100).optional(),
});
