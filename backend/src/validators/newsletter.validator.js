import { z } from 'zod';

export const newsletterSubscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
});
