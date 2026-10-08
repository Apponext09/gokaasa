import { z } from 'zod';

export const settingsUpdateSchema = z.object({
  companyName: z.string().trim().min(1).max(200).optional(),
  supportPhone: z.string().trim().max(30).optional(),
  supportEmail: z.string().trim().email().max(254).optional(),
});
