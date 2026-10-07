-- Room inventory, pricing, availability, bookings and payments.
-- All money is stored as integer minor units (paise for INR) to avoid float drift.

CREATE TABLE room_types (
  id                      BIGSERIAL PRIMARY KEY,
  hotel_id                BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  name                    TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  category                TEXT NOT NULL DEFAULT 'STANDARD'
                          CHECK (category IN ('STANDARD', 'DELUXE', 'SUITE', 'FAMILY', 'VILLA', 'DORM', 'OTHER')),
  description             TEXT,
  max_adults              SMALLINT NOT NULL DEFAULT 2 CHECK (max_adults BETWEEN 1 AND 20),
  max_children            SMALLINT NOT NULL DEFAULT 0 CHECK (max_children BETWEEN 0 AND 20),
  max_occupancy           SMALLINT NOT NULL DEFAULT 2 CHECK (max_occupancy BETWEEN 1 AND 30),
  bed_type                TEXT CHECK (bed_type IN ('KING', 'QUEEN', 'DOUBLE', 'TWIN', 'SINGLE', 'SOFA_BED', 'BUNK')),
  bed_count               SMALLINT NOT NULL DEFAULT 1 CHECK (bed_count BETWEEN 1 AND 10),
  room_size_sqm           NUMERIC(6, 1) CHECK (room_size_sqm > 0),
  view                    TEXT,
  cancellation_policy_id  BIGINT REFERENCES cancellation_policies (id) ON DELETE SET NULL,
  status                  TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ,
  CONSTRAINT room_types_occupancy CHECK (max_occupancy >= max_adults AND max_occupancy <= max_adults + max_children)
);

CREATE UNIQUE INDEX room_types_name_unique ON room_types (hotel_id, lower(name)) WHERE deleted_at IS NULL;

-- Physical units. Availability is tracked per room type, rooms give the unit count and room numbers.
CREATE TABLE rooms (
  id            BIGSERIAL PRIMARY KEY,
  hotel_id      BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  room_type_id  BIGINT NOT NULL REFERENCES room_types (id) ON DELETE CASCADE,
  room_number   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'OUT_OF_ORDER')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX rooms_number_unique ON rooms (hotel_id, room_number) WHERE deleted_at IS NULL;

CREATE TABLE room_images (
  id            BIGSERIAL PRIMARY KEY,
  room_type_id  BIGINT NOT NULL REFERENCES room_types (id) ON DELETE CASCADE,
  storage_key   TEXT,
  source_url    TEXT,
  source_provider TEXT,
  alt_text      TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT room_images_has_source CHECK (storage_key IS NOT NULL OR source_url IS NOT NULL)
);

CREATE TABLE room_amenities (
  room_type_id BIGINT NOT NULL REFERENCES room_types (id) ON DELETE CASCADE,
  amenity_id   SMALLINT NOT NULL REFERENCES amenities (id) ON DELETE CASCADE,
  PRIMARY KEY (room_type_id, amenity_id)
);

CREATE TABLE room_rates (
  id                BIGSERIAL PRIMARY KEY,
  room_type_id      BIGINT NOT NULL REFERENCES room_types (id) ON DELETE CASCADE,
  meal_plan         TEXT NOT NULL DEFAULT 'ROOM_ONLY'
                    CHECK (meal_plan IN ('ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD')),
  valid_from        DATE NOT NULL,
  valid_to          DATE NOT NULL,
  currency          CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  base_price_minor  BIGINT NOT NULL CHECK (base_price_minor >= 0),
  discount_percent  NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  tax_percent       NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tax_percent BETWEEN 0 AND 100),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_rates_valid_range CHECK (valid_to >= valid_from)
);

CREATE INDEX room_rates_lookup_idx ON room_rates (room_type_id, meal_plan, valid_from, valid_to);

CREATE TABLE availability (
  room_type_id  BIGINT NOT NULL REFERENCES room_types (id) ON DELETE CASCADE,
  stay_date     DATE NOT NULL,
  units_total   INTEGER NOT NULL CHECK (units_total >= 0),
  units_booked  INTEGER NOT NULL DEFAULT 0 CHECK (units_booked >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_type_id, stay_date),
  CONSTRAINT availability_not_oversold CHECK (units_booked <= units_total)
);

CREATE TABLE coupons (
  id              BIGSERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]{3,40}$'),
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
  discount_value  BIGINT NOT NULL CHECK (discount_value > 0),
  max_discount_minor BIGINT CHECK (max_discount_minor >= 0),
  min_amount_minor   BIGINT NOT NULL DEFAULT 0 CHECK (min_amount_minor >= 0),
  valid_from      TIMESTAMPTZ NOT NULL,
  valid_to        TIMESTAMPTZ NOT NULL,
  usage_limit     INTEGER CHECK (usage_limit > 0),
  used_count      INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coupons_valid_range CHECK (valid_to > valid_from),
  CONSTRAINT coupons_percent_range CHECK (discount_type <> 'PERCENT' OR discount_value <= 100)
);

CREATE TABLE bookings (
  id                       BIGSERIAL PRIMARY KEY,
  booking_ref              TEXT NOT NULL UNIQUE CHECK (booking_ref ~ '^GK-[0-9]{4}-[0-9]{6,}$'),
  user_id                  BIGINT NOT NULL REFERENCES users (id),
  hotel_id                 BIGINT NOT NULL REFERENCES hotels (id),
  status                   TEXT NOT NULL DEFAULT 'INITIATED'
                           CHECK (status IN ('INITIATED', 'PAYMENT_PENDING', 'PAID', 'CONFIRMED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'FAILED')),
  check_in                 DATE NOT NULL,
  check_out                DATE NOT NULL,
  adults                   SMALLINT NOT NULL CHECK (adults >= 1),
  children                 SMALLINT NOT NULL DEFAULT 0 CHECK (children >= 0),
  rooms_count              SMALLINT NOT NULL CHECK (rooms_count >= 1),
  currency                 CHAR(3) NOT NULL DEFAULT 'INR',
  subtotal_minor           BIGINT NOT NULL CHECK (subtotal_minor >= 0),
  taxes_minor              BIGINT NOT NULL CHECK (taxes_minor >= 0),
  fees_minor               BIGINT NOT NULL DEFAULT 0 CHECK (fees_minor >= 0),
  discount_minor           BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_minor              BIGINT NOT NULL CHECK (total_minor >= 0),
  coupon_id                BIGINT REFERENCES coupons (id),
  cancellation_policy      JSONB NOT NULL,
  primary_first_name       TEXT NOT NULL,
  primary_last_name        TEXT NOT NULL,
  primary_email            CITEXT NOT NULL,
  primary_phone            TEXT NOT NULL,
  gst_number               TEXT,
  company_name             TEXT,
  special_request          TEXT CHECK (char_length(special_request) <= 500),
  cancelled_at             TIMESTAMPTZ,
  cancellation_reason      TEXT,
  version                  INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookings_dates CHECK (check_out > check_in),
  CONSTRAINT bookings_total CHECK (total_minor = subtotal_minor + taxes_minor + fees_minor - discount_minor),
  CONSTRAINT bookings_cancelled_requires_timestamp CHECK (
    status NOT IN ('CANCELLED', 'REFUND_PENDING', 'REFUNDED') OR cancelled_at IS NOT NULL
  ),
  CONSTRAINT bookings_timestamp_requires_cancelled CHECK (
    cancelled_at IS NULL OR status IN ('CANCELLED', 'REFUND_PENDING', 'REFUNDED')
  )
);

CREATE INDEX bookings_user_idx ON bookings (user_id, check_in DESC);
CREATE INDEX bookings_hotel_idx ON bookings (hotel_id, check_in);
CREATE INDEX bookings_status_idx ON bookings (status);

CREATE TABLE booking_rooms (
  id                BIGSERIAL PRIMARY KEY,
  booking_id        BIGINT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  room_type_id      BIGINT NOT NULL REFERENCES room_types (id),
  meal_plan         TEXT NOT NULL CHECK (meal_plan IN ('ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD')),
  quantity          SMALLINT NOT NULL CHECK (quantity >= 1),
  nights            SMALLINT NOT NULL CHECK (nights >= 1),
  rate_per_night_minor BIGINT NOT NULL CHECK (rate_per_night_minor >= 0),
  subtotal_minor    BIGINT NOT NULL CHECK (subtotal_minor >= 0),
  taxes_minor       BIGINT NOT NULL CHECK (taxes_minor >= 0),
  total_minor       BIGINT NOT NULL CHECK (total_minor >= 0)
);

CREATE INDEX booking_rooms_booking_idx ON booking_rooms (booking_id);

CREATE TABLE booking_guests (
  id          BIGSERIAL PRIMARY KEY,
  booking_id  BIGINT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 160),
  age         SMALLINT CHECK (age BETWEEN 0 AND 120),
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX booking_guests_one_primary ON booking_guests (booking_id) WHERE is_primary;

CREATE TABLE payments (
  id                  BIGSERIAL PRIMARY KEY,
  booking_id          BIGINT NOT NULL REFERENCES bookings (id),
  provider            TEXT NOT NULL DEFAULT 'RAZORPAY' CHECK (provider IN ('RAZORPAY')),
  provider_order_id   TEXT NOT NULL UNIQUE,
  provider_payment_id TEXT UNIQUE,
  amount_minor        BIGINT NOT NULL CHECK (amount_minor > 0),
  currency            CHAR(3) NOT NULL DEFAULT 'INR',
  status              TEXT NOT NULL DEFAULT 'CREATED'
                      CHECK (status IN ('CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')),
  failure_reason      TEXT,
  provider_payload    JSONB,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payments_success_has_payment CHECK (status <> 'SUCCESS' OR provider_payment_id IS NOT NULL)
);

CREATE INDEX payments_booking_idx ON payments (booking_id);

CREATE TABLE refunds (
  id                BIGSERIAL PRIMARY KEY,
  payment_id        BIGINT NOT NULL REFERENCES payments (id),
  booking_id        BIGINT NOT NULL REFERENCES bookings (id),
  amount_minor      BIGINT NOT NULL CHECK (amount_minor > 0),
  status            TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
  provider_refund_id TEXT UNIQUE,
  reason            TEXT,
  requested_by      BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at      TIMESTAMPTZ
);

CREATE TABLE coupon_usages (
  id              BIGSERIAL PRIMARY KEY,
  coupon_id       BIGINT NOT NULL REFERENCES coupons (id),
  booking_id      BIGINT NOT NULL UNIQUE REFERENCES bookings (id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users (id),
  discount_minor  BIGINT NOT NULL CHECK (discount_minor >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
