import { z } from 'zod';

export const commissionRateSchema = z.object({
  ratePercent: z.coerce.number().min(0, 'Rate must be at least 0%').max(100, 'Rate must be at most 100%'),
  reason: z.string().trim().max(300).optional(),
});
