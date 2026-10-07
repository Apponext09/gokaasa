import { z } from 'zod';

const positiveId = z.coerce.number().int().positive();
const pagination = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(10) };

export const reviewIdParam = z.object({ id: positiveId });
export const bookingIdParam = z.object({ bookingId: positiveId });
export const hotelReviewsQuery = z.object({ ...pagination, sort: z.enum(['newest', 'highest', 'lowest']).default('newest') });

const reviewFields = {
  rating: z.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
  title: z.string().trim().max(150, 'Keep the title to 150 characters or fewer').optional().transform((v) => v || undefined),
  body: z.string().trim().min(10, 'Say a little more about your stay (at least 10 characters)').max(4000, 'Keep the review to 4000 characters or fewer'),
};

export const reviewCreateSchema = z.object({
  bookingId: positiveId,
  ...reviewFields,
});

export const reviewUpdateSchema = z.object(reviewFields);

export const moderateSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'HIDE', 'RESTORE']),
  reason: z.string().trim().max(500).optional(),
});

export const adminReviewListQuery = z.object({
  ...pagination,
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN']).optional(),
  hotelId: positiveId.optional(),
  q: z.string().trim().max(100).optional(),
});
