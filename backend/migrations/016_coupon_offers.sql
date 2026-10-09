-- Dynamic Offer & Coupon Management: extends the coupons/coupon_usages tables that have existed since
-- migration 003 but were never wired to any application code (no service, route or UI touched them).
-- Nothing here duplicates or replaces those tables; this only adds the restriction/limit columns the
-- feature needs and the usage-lifecycle columns a hold-based reservation (mirroring how room inventory
-- is reserved per-hold and released on expiry) requires.

ALTER TABLE coupons ADD COLUMN per_user_limit INTEGER CHECK (per_user_limit > 0);
ALTER TABLE coupons ADD COLUMN min_nights SMALLINT CHECK (min_nights > 0);
ALTER TABLE coupons ADD COLUMN customer_eligibility TEXT NOT NULL DEFAULT 'ALL'
  CHECK (customer_eligibility IN ('ALL', 'NEW_CUSTOMERS'));
-- The stay (check-in/check-out) must fall inside this window, when set. Distinct from valid_from/valid_to,
-- which govern when the coupon may be APPLIED, not which stay dates it discounts.
ALTER TABLE coupons ADD COLUMN stay_from DATE;
ALTER TABLE coupons ADD COLUMN stay_to DATE;
ALTER TABLE coupons ADD COLUMN description TEXT CHECK (char_length(description) <= 300);
ALTER TABLE coupons ADD COLUMN created_by BIGINT REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE coupons ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE coupons ADD CONSTRAINT coupons_stay_range CHECK (stay_to IS NULL OR stay_from IS NULL OR stay_to >= stay_from);

-- Empty (no rows) = applies to every hotel / every destination. Non-empty = restricted to the listed set.
CREATE TABLE coupon_hotels (
  coupon_id BIGINT NOT NULL REFERENCES coupons (id) ON DELETE CASCADE,
  hotel_id  BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  PRIMARY KEY (coupon_id, hotel_id)
);

CREATE TABLE coupon_destinations (
  coupon_id BIGINT NOT NULL REFERENCES coupons (id) ON DELETE CASCADE,
  city      TEXT NOT NULL,
  PRIMARY KEY (coupon_id, city)
);

-- A usage is reserved (PENDING) the moment a coupon is applied to a hold -- the same instant room
-- inventory is reserved for that hold -- and is RELEASED if the hold expires/is released, or flips to
-- CONFIRMED (with booking_id set) once the booking it ends up on is actually paid. used_count on the
-- coupon counts PENDING + CONFIRMED together, so a concurrent second guest cannot apply a coupon whose
-- last slot is already held by someone still mid-checkout.
ALTER TABLE coupon_usages ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE coupon_usages ADD COLUMN hold_id BIGINT REFERENCES booking_holds (id) ON DELETE CASCADE;
ALTER TABLE coupon_usages ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (status IN ('PENDING', 'CONFIRMED', 'RELEASED'));
CREATE UNIQUE INDEX coupon_usages_one_pending_per_hold ON coupon_usages (hold_id) WHERE status = 'PENDING';

-- Holds: the coupon applied to this hold (if any) and the discount it is currently worth. Separate from
-- discount_minor, which is the hotel's own rate-plan promotional discount -- a coupon is a distinct,
-- customer-applied adjustment on top of that, so the two are never conflated into one column.
ALTER TABLE booking_holds ADD COLUMN coupon_id BIGINT REFERENCES coupons (id);
ALTER TABLE booking_holds ADD COLUMN coupon_code TEXT;
ALTER TABLE booking_holds ADD COLUMN coupon_discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (coupon_discount_minor >= 0);
ALTER TABLE booking_holds DROP CONSTRAINT booking_holds_total;
ALTER TABLE booking_holds ADD CONSTRAINT booking_holds_total
  CHECK (total_minor = subtotal_minor - discount_minor + taxes_minor + fees_minor - coupon_discount_minor);

-- Bookings: coupon_id already existed (migration 003) but was never populated. coupon_code and
-- coupon_discount_minor are the same per-booking snapshot pattern used for hotel_name, rate_plan_name etc.
-- -- fixed at booking time, immune to the coupon being edited or deactivated afterwards.
ALTER TABLE bookings ADD COLUMN coupon_code TEXT;
ALTER TABLE bookings ADD COLUMN coupon_discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (coupon_discount_minor >= 0);
ALTER TABLE bookings DROP CONSTRAINT bookings_total;
ALTER TABLE bookings ADD CONSTRAINT bookings_total
  CHECK (total_minor = subtotal_minor + taxes_minor + fees_minor - discount_minor - coupon_discount_minor);
