-- Phase 3A: room inventory, rate plans, date-based pricing, availability blocks, reservations,
-- and reusable cancellation policies. Extends the existing tables from migration 003 rather than
-- duplicating them. room_rates and availability were never written by application code, so they are
-- replaced here.

-- 1. Cancellation policies: one deadline tier, matching the spec ("50% refund until 48 hours before check-in").
ALTER TABLE cancellation_policies DROP CONSTRAINT IF EXISTS cancellation_non_refundable_rule;
ALTER TABLE cancellation_policies RENAME COLUMN free_cancellation_hours TO cancellation_deadline_hours;
ALTER TABLE cancellation_policies RENAME COLUMN partial_refund_percent TO refund_percent;
ALTER TABLE cancellation_policies ADD COLUMN code TEXT CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$');
ALTER TABLE cancellation_policies ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE cancellation_policies ADD CONSTRAINT cancellation_non_refundable_rule CHECK (
  NOT is_non_refundable OR (cancellation_deadline_hours IS NULL AND refund_percent = 0)
);
ALTER TABLE cancellation_policies ADD CONSTRAINT cancellation_refund_needs_deadline CHECK (
  is_non_refundable OR refund_percent = 0 OR cancellation_deadline_hours IS NOT NULL
);
CREATE UNIQUE INDEX cancellation_policies_code_unique ON cancellation_policies (hotel_id, code)
  WHERE code IS NOT NULL AND deleted_at IS NULL;

-- 2. Room types: code per hotel, smoking policy, archive state, physical unit count.
ALTER TABLE room_types DROP CONSTRAINT IF EXISTS room_types_status_check;
ALTER TABLE room_types ADD CONSTRAINT room_types_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'));
ALTER TABLE room_types ADD COLUMN room_code TEXT CHECK (room_code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$');
UPDATE room_types SET room_code = 'RT' || id WHERE room_code IS NULL;
ALTER TABLE room_types ALTER COLUMN room_code SET NOT NULL;
ALTER TABLE room_types ADD COLUMN smoking TEXT NOT NULL DEFAULT 'NON_SMOKING' CHECK (smoking IN ('SMOKING', 'NON_SMOKING'));
ALTER TABLE room_types ADD COLUMN total_units INTEGER NOT NULL DEFAULT 0 CHECK (total_units >= 0);
ALTER TABLE room_types ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE room_types ADD CONSTRAINT room_types_archive_consistency CHECK ((status = 'ARCHIVED') = (archived_at IS NOT NULL));
CREATE UNIQUE INDEX room_types_code_unique ON room_types (hotel_id, room_code) WHERE deleted_at IS NULL;

-- 3. Room images: the same media model as hotel images (uploads only, one cover, no duplicate files).
ALTER TABLE room_images ADD COLUMN mime_type TEXT CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'));
ALTER TABLE room_images ADD COLUMN byte_size INTEGER CHECK (byte_size > 0);
ALTER TABLE room_images ADD COLUMN content_hash TEXT CHECK (content_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE room_images ADD COLUMN is_cover BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE room_images ADD COLUMN created_by BIGINT REFERENCES users (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX room_images_one_cover ON room_images (room_type_id) WHERE is_cover AND deleted_at IS NULL;
CREATE UNIQUE INDEX room_images_hash_unique ON room_images (room_type_id, content_hash)
  WHERE content_hash IS NOT NULL AND deleted_at IS NULL;

-- 4. Replace the unused flat rate table with rate plans (products) and per-date prices (components).
DROP TABLE IF EXISTS room_rates;
DROP TABLE IF EXISTS availability;

CREATE TABLE rate_plans (
  id                      BIGSERIAL PRIMARY KEY,
  hotel_id                BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  room_type_id            BIGINT NOT NULL REFERENCES room_types (id) ON DELETE CASCADE,
  code                    TEXT NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name                    TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  description             TEXT CHECK (char_length(description) <= 1000),
  meal_plan               TEXT NOT NULL CHECK (meal_plan IN ('ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD')),
  is_refundable           BOOLEAN NOT NULL DEFAULT TRUE,
  cancellation_policy_id  BIGINT REFERENCES cancellation_policies (id) ON DELETE SET NULL,
  currency                CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  discount_percent        NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  tax_percent             NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tax_percent BETWEEN 0 AND 100),
  fee_minor               BIGINT NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  status                  TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ
);

CREATE UNIQUE INDEX rate_plans_code_unique ON rate_plans (room_type_id, code) WHERE deleted_at IS NULL;
CREATE INDEX rate_plans_room_idx ON rate_plans (room_type_id) WHERE deleted_at IS NULL;

-- One row per rate plan per night. Every component is stored; final price is checked against them.
CREATE TABLE rate_prices (
  rate_plan_id     BIGINT NOT NULL REFERENCES rate_plans (id) ON DELETE CASCADE,
  stay_date        DATE NOT NULL,
  base_price_minor BIGINT NOT NULL CHECK (base_price_minor >= 0),
  discount_minor   BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_minor        BIGINT NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  fee_minor        BIGINT NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  final_price_minor BIGINT NOT NULL CHECK (final_price_minor >= 0),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rate_plan_id, stay_date),
  CONSTRAINT rate_prices_discount_bound CHECK (discount_minor <= base_price_minor),
  CONSTRAINT rate_prices_final_total CHECK (final_price_minor = base_price_minor - discount_minor + tax_minor + fee_minor)
);

-- 5. Per-night inventory settings for a room type: unit override, sell/close, stay length limits.
--    Availability is derived from these plus reservations and blocks. Only the settings are stored.
CREATE TABLE room_inventory (
  room_type_id  BIGINT NOT NULL REFERENCES room_types (id) ON DELETE CASCADE,
  stay_date     DATE NOT NULL,
  units         INTEGER CHECK (units >= 0),
  is_closed     BOOLEAN NOT NULL DEFAULT FALSE,
  min_stay      SMALLINT CHECK (min_stay BETWEEN 1 AND 365),
  max_stay      SMALLINT CHECK (max_stay BETWEEN 1 AND 365),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_type_id, stay_date),
  CONSTRAINT room_inventory_stay_bounds CHECK (min_stay IS NULL OR max_stay IS NULL OR max_stay >= min_stay)
);

-- 6. Maintenance and owner blocks over a date range. end_date is exclusive.
CREATE TABLE availability_blocks (
  id            BIGSERIAL PRIMARY KEY,
  room_type_id  BIGINT NOT NULL REFERENCES room_types (id) ON DELETE CASCADE,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  reason        TEXT NOT NULL CHECK (reason IN ('MAINTENANCE', 'OWNER_USE', 'OTHER')),
  note          TEXT CHECK (char_length(note) <= 300),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT availability_blocks_range CHECK (end_date > start_date)
);

CREATE INDEX availability_blocks_room_dates ON availability_blocks (room_type_id, start_date, end_date) WHERE is_active;

-- 7. Reservations against inventory, one row per room per night. Bookings insert here inside a
--    transaction that locks the room type row (see services/inventory.service.js).
CREATE TABLE inventory_reservations (
  id            BIGSERIAL PRIMARY KEY,
  room_type_id  BIGINT NOT NULL REFERENCES room_types (id),
  stay_date     DATE NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  booking_id    BIGINT REFERENCES bookings (id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('HELD', 'CONFIRMED', 'RELEASED')),
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_reservations_hold_expiry CHECK (status <> 'HELD' OR expires_at IS NOT NULL)
);

CREATE INDEX inventory_reservations_nights ON inventory_reservations (room_type_id, stay_date)
  WHERE status IN ('HELD', 'CONFIRMED');
