import { z } from 'zod';

export const hotelReviewListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['PENDING', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED']).optional(),
});

export const hotelReviewDecisionSchema = z.object({
  summary: z.string().trim().max(2000).nullish().transform((value) => value || null),
});

export const hotelReviewChangesSchema = z.object({
  summary: z.string().trim().min(3, 'Explain what needs to change').max(2000),
});

