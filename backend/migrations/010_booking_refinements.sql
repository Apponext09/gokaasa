-- Phase 3B-2 refinements: an optional billing address alongside the existing company/GST fields, and an
-- optional client-supplied idempotency key on holds so a double-submitted "Continue" reuses the first
-- attempt's hold instead of tying up a second set of rooms. Callers that send no key are unaffected.

ALTER TABLE bookings ADD COLUMN billing_address TEXT CHECK (char_length(billing_address) <= 300);

ALTER TABLE booking_holds ADD COLUMN idempotency_key TEXT CHECK (char_length(idempotency_key) <= 100);
CREATE UNIQUE INDEX booking_holds_idempotency_unique ON booking_holds (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
