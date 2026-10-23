import { z } from 'zod';

const positiveId = z.coerce.number().int().positive();
const pagination = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format');

const ENTRY_TYPES = [
  'BOOKING_EARNING', 'PLATFORM_COMMISSION', 'REFUND_ADJUSTMENT', 'COMMISSION_REVERSAL',
  'SETTLEMENT_DEBIT', 'SETTLEMENT_REVERSAL', 'MANUAL_ADJUSTMENT',
];

export const earningsSummaryQuery = z.object({ hotelId: positiveId.optional() });

export const ledgerEntryListQuery = z.object({
  ...pagination,
  hotelId: positiveId.optional(),
  bookingId: positiveId.optional(),
  entryType: z.enum(ENTRY_TYPES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const earningsBookingParam = z.object({ bookingId: positiveId });
