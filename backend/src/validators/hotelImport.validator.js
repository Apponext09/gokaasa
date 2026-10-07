import { z } from 'zod';

export const importSearchSchema = z.object({
  query: z.string().trim().min(2, 'Enter at least 2 characters').max(200),
});

export const importCreateSchema = z.object({
  provider: z.string().regex(/^[a-z_]{2,40}$/),
  externalId: z.string().trim().min(1).max(200),
  query: z.string().trim().max(200).optional(),
});

export const importJobsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVIEW_REQUIRED']).optional(),
});
