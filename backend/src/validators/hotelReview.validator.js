import { z } from 'zod';
import { idParam } from './hotel.validator.js';

export const hotelReviewListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['PENDING', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED']).optional(),
  assignedToMe: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});

export const hotelReviewIssueSchema = z.object({
  section: z.enum(['OVERVIEW', 'LOCATION', 'IMAGES', 'AMENITIES', 'ROOMS', 'POLICIES', 'OTHER']),
  fieldName: z.string().trim().max(120).nullish().transform((value) => value || null),
  severity: z.enum(['REQUIRED', 'SUGGESTION']).default('REQUIRED'),
  comment: z.string().trim().min(3).max(2000),
});

export const hotelReviewDecisionSchema = z.object({
  summary: z.string().trim().max(2000).nullish().transform((value) => value || null),
});

export const hotelReviewAssignSchema = z.object({ reviewerId: z.coerce.number().int().positive() });
export const hotelReviewIssueParam = idParam.extend({ issueId: z.coerce.number().int().positive() });

