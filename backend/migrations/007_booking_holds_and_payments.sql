-- Phase 3B-2: temporary inventory holds, booking commercial snapshots, payment and refund hardening,
-- webhook idempotency, and hotel business time zones. Extends the 003 tables; nothing is duplicated.

-- 1. Hotel business time zone. "Today" for a hotel is computed in this zone (date-only semantics).
ALTER TABLE hotels ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'Asia/Kolkata'
  CHECK (char_length(time_zone) BETWEEN 3 AND 64);

-- 2. Booking holds: a short, server-owned claim on rooms while the guest completes the booking.
CREATE TABLE booking_holds (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users (id),
  hotel_id         BIGINT NOT NULL REFERENCES hotels (id),
  room_type_id     BIGINT NOT NULL REFERENCES room_types (id),
  rate_plan_id     BIGINT NOT NULL REFERENCES rate_plans (id),
  check_in         DATE NOT NULL,
  check_out        DATE NOT NULL,
  nights           SMALLINT NOT NULL CHECK (nights >= 1),
  rooms            SMALLINT NOT NULL CHECK (rooms >= 1),
  occupancy        JSONB NOT NULL,
  currency         CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_minor   BIGINT NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor   BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  taxes_minor      BIGINT NOT NULL DEFAULT 0 CHECK (taxes_minor >= 0),
  fees_minor       BIGINT NOT NULL DEFAULT 0 CHECK (fees_minor >= 0),
  total_minor      BIGINT NOT NULL CHECK (total_minor >= 0),
  -- Everything the quote depended on at the moment it was made: nightly components, room, plan, hotel and
  -- cancellation policy. Later changes to those records never alter an existing hold or booking.
  quote_snapshot   JSONB NOT NULL,
  guest_details    JSONB,
  status           TEXT NOT NULL DEFAULT 'HELD'
                   CHECK (status IN ('HELD', 'CONVERTED', 'EXPIRED', 'RELEASED')),
  expires_at       TIMESTAMPTZ NOT NULL,
  booking_id       BIGINT REFERENCES bookings (id),
  converted_at     TIMESTAMPTZ,
  released_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booking_holds_dates CHECK (check_out > check_in),
  CONSTRAINT booking_holds_total CHECK (total_minor = subtotal_minor - discount_minor + taxes_minor + fees_minor),
  CONSTRAINT booking_holds_converted_has_booking CHECK (status <> 'CONVERTED' OR booking_id IS NOT NULL)
);

CREATE INDEX booking_holds_user_idx ON booking_holds (user_id, created_at DESC);
CREATE INDEX booking_holds_live_idx ON booking_holds (status, expires_at) WHERE status = 'HELD';

-- Inventory rows now belong to a hold, so a release or expiry can find exactly the rows it must free.
ALTER TABLE inventory_reservations ADD COLUMN hold_id BIGINT REFERENCES booking_holds (id) ON DELETE CASCADE;
CREATE INDEX inventory_reservations_hold_idx ON inventory_reservations (hold_id) WHERE hold_id IS NOT NULL;

-- 3. Bookings: EXPIRED status, link to the hold, and the commercial snapshot shown to the guest.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN (
  'INITIATED', 'PAYMENT_PENDING', 'PAID', 'CONFIRMED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'FAILED', 'EXPIRED'
));
ALTER TABLE bookings ADD COLUMN hold_id BIGINT UNIQUE REFERENCES booking_holds (id);
ALTER TABLE bookings ADD COLUMN hotel_name TEXT;
ALTER TABLE bookings ADD COLUMN hotel_slug TEXT;
ALTER TABLE bookings ADD COLUMN hotel_address TEXT;
ALTER TABLE bookings ADD COLUMN hotel_city TEXT;
ALTER TABLE bookings ADD COLUMN hotel_country_code CHAR(2);
ALTER TABLE bookings ADD COLUMN hotel_image_url TEXT;
ALTER TABLE bookings ADD COLUMN rate_plan_name TEXT;
ALTER TABLE bookings ADD COLUMN meal_plan TEXT;
ALTER TABLE bookings ADD COLUMN is_refundable BOOLEAN;
ALTER TABLE bookings ADD COLUMN cancellation_deadline_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN paid_minor BIGINT NOT NULL DEFAULT 0 CHECK (paid_minor >= 0);
ALTER TABLE bookings ADD COLUMN refunded_minor BIGINT NOT NULL DEFAULT 0 CHECK (refunded_minor >= 0);

-- Booking references come from one sequence, so they are unique and never reused.
CREATE SEQUENCE booking_ref_seq START 1;

-- 4. Booking lines and guests carry the names and occupancy of that moment.
ALTER TABLE booking_rooms ADD COLUMN room_name TEXT;
ALTER TABLE booking_rooms ADD COLUMN rate_plan_id BIGINT REFERENCES rate_plans (id);
ALTER TABLE booking_rooms ADD COLUMN rate_plan_name TEXT;
ALTER TABLE booking_rooms ADD COLUMN discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0);
ALTER TABLE booking_rooms ADD COLUMN fees_minor BIGINT NOT NULL DEFAULT 0 CHECK (fees_minor >= 0);
ALTER TABLE booking_guests ADD COLUMN room_index SMALLINT NOT NULL DEFAULT 0 CHECK (room_index >= 0);
ALTER TABLE booking_guests ADD COLUMN first_name TEXT;
ALTER TABLE booking_guests ADD COLUMN last_name TEXT;

-- 5. Payments: gateway mode, attempt number, and at most one successful payment per booking.
ALTER TABLE payments ADD COLUMN gateway_mode TEXT NOT NULL DEFAULT 'LIVE'
  CHECK (gateway_mode IN ('LIVE', 'TEST', 'SIMULATED'));
ALTER TABLE payments ADD COLUMN attempt SMALLINT NOT NULL DEFAULT 1 CHECK (attempt >= 1);
CREATE UNIQUE INDEX payments_one_success_per_booking ON payments (booking_id)
  WHERE status IN ('SUCCESS', 'REFUNDED');

-- 6. Refunds: PROCESSING state, idempotency key, and one active refund per booking.
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_status_check;
ALTER TABLE refunds ADD CONSTRAINT refunds_status_check CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'));
ALTER TABLE refunds ADD COLUMN idempotency_key TEXT UNIQUE;
CREATE UNIQUE INDEX refunds_one_active_per_booking ON refunds (booking_id)
  WHERE status IN ('PENDING', 'PROCESSING', 'SUCCESS');

-- 7. Webhook events: each provider event is processed once, however often it is delivered.
CREATE TABLE payment_webhook_events (
  id                  BIGSERIAL PRIMARY KEY,
  provider_event_id   TEXT NOT NULL UNIQUE,
  event_type          TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 80),
  provider_payment_id TEXT,
  provider_order_id   TEXT,
  status              TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')),
  payload             JSONB NOT NULL,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at        TIMESTAMPTZ
);
