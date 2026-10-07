-- Phase 3B-2: the check-in instant is snapshotted on the booking, so cancellation deadlines do not change
-- when the hotel later edits its check-in time or time zone. cancellation_policy already holds the policy snapshot.
ALTER TABLE bookings ADD COLUMN check_in_at TIMESTAMPTZ;
ALTER TABLE bookings ADD CONSTRAINT bookings_check_in_at_required
  CHECK (status = 'INITIATED' OR check_in_at IS NOT NULL);

-- Released reservations are kept for audit; the nightly availability query already ignores them.
CREATE INDEX IF NOT EXISTS payments_open_idx ON payments (booking_id) WHERE status IN ('CREATED', 'PENDING');
