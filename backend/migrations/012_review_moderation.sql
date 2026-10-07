-- Phase 5: the reviews table existed (migration 004) but nothing was built on it. It had a two-state
-- PUBLISHED/HIDDEN status with no real moderation workflow; this gives it one, plus the metadata an
-- admin moderation action needs. booking_id UNIQUE and (hotel_id, user_id) UNIQUE already enforce "one
-- review per booking" and "one review per guest per hotel" at the database level -- nothing to add there.

UPDATE reviews SET status = 'APPROVED' WHERE status = 'PUBLISHED';

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_status_check;
ALTER TABLE reviews ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE reviews ADD CONSTRAINT reviews_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN'));

ALTER TABLE reviews ADD COLUMN moderated_by BIGINT REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE reviews ADD COLUMN moderated_at TIMESTAMPTZ;
ALTER TABLE reviews ADD COLUMN moderation_reason TEXT CHECK (char_length(moderation_reason) <= 500);

-- The public "approved reviews for a hotel" lookup and the per-hotel rating aggregate both filter on
-- this pair; the old index's partial predicate (status = 'PUBLISHED') no longer matches any row.
DROP INDEX IF EXISTS reviews_hotel_idx;
CREATE INDEX reviews_hotel_approved_idx ON reviews (hotel_id, created_at DESC) WHERE status = 'APPROVED';
CREATE INDEX reviews_hotel_rating_idx ON reviews (hotel_id, rating) WHERE status = 'APPROVED';

-- The admin moderation queue filters and sorts by these.
CREATE INDEX reviews_moderation_idx ON reviews (status, created_at DESC);
CREATE INDEX reviews_user_idx ON reviews (user_id, created_at DESC);
