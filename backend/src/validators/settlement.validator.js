import { z } from 'zod';

const positiveId = z.coerce.number().int().positive();
const pagination = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };

const SETTLEMENT_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'REVERSED'];

export const settlementListQuery = z.object({
  ...pagination,
  hotelId: positiveId.optional(),
  status: z.enum(SETTLEMENT_STATUSES).optional(),
});

export const settlementIdParam = z.object({ id: positiveId });

export const settlementCreateSchema = z.object({ hotelId: positiveId });

export const settlementMarkPaidSchema = z.object({
  payoutReference: z.string().trim().min(1, 'Provide a payout reference').max(120),
});

export const settlementReverseSchema = z.object({
  reason: z.string().trim().min(1, 'Provide a reason').max(300),
});
