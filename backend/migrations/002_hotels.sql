-- Hotel catalogue: hotels, locations, amenities, images, policies.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE amenities (
  id         SMALLSERIAL PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  name       TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('CONNECTIVITY', 'DINING', 'WELLNESS', 'LEISURE', 'ROOM', 'SERVICES', 'TRANSPORT', 'ACCESSIBILITY', 'OTHER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hotels (
  id                    BIGSERIAL PRIMARY KEY,
  slug                  TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                  TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 200),
  short_name            TEXT CHECK (char_length(short_name) <= 60),
  description           TEXT,
  property_type         TEXT NOT NULL DEFAULT 'HOTEL'
                        CHECK (property_type IN ('HOTEL', 'RESORT', 'VILLA', 'APARTMENT', 'HOSTEL', 'GUEST_HOUSE')),
  star_rating           SMALLINT CHECK (star_rating BETWEEN 1 AND 5),
  guest_rating          NUMERIC(2, 1) CHECK (guest_rating BETWEEN 0 AND 5),
  review_count          INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  address_line          TEXT,
  area                  TEXT,
  city                  TEXT NOT NULL,
  state                 TEXT,
  country_code          CHAR(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  postal_code           TEXT,
  latitude              NUMERIC(9, 6) CHECK (latitude BETWEEN -90 AND 90),
  longitude             NUMERIC(9, 6) CHECK (longitude BETWEEN -180 AND 180),
  phone                 TEXT,
  email                 CITEXT,
  website               TEXT,
  check_in_time         TIME,
  check_out_time        TIME,
  status                TEXT NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'READY_TO_PUBLISH', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED')),
  external_provider     TEXT,
  external_id           TEXT,
  published_at          TIMESTAMPTZ,
  archived_at           TIMESTAMPTZ,
  created_by            BIGINT REFERENCES users (id) ON DELETE SET NULL,
  updated_by            BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,
  CONSTRAINT hotels_external_pair CHECK ((external_provider IS NULL) = (external_id IS NULL)),
  CONSTRAINT hotels_publish_consistency CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL),
  CONSTRAINT hotels_archive_consistency CHECK ((status = 'ARCHIVED') = (archived_at IS NOT NULL))
);

-- One hotel per external record per provider, so re-importing never duplicates.
CREATE UNIQUE INDEX hotels_external_unique ON hotels (external_provider, external_id)
  WHERE external_provider IS NOT NULL AND deleted_at IS NULL;

-- Search and filter indexes (hotel search is a hot path).
CREATE INDEX hotels_status_idx ON hotels (status) WHERE deleted_at IS NULL;
CREATE INDEX hotels_city_idx ON hotels (lower(city)) WHERE deleted_at IS NULL;
CREATE INDEX hotels_country_idx ON hotels (country_code) WHERE deleted_at IS NULL;
CREATE INDEX hotels_star_rating_idx ON hotels (star_rating) WHERE deleted_at IS NULL;
CREATE INDEX hotels_property_type_idx ON hotels (property_type) WHERE deleted_at IS NULL;
CREATE INDEX hotels_geo_idx ON hotels (latitude, longitude) WHERE deleted_at IS NULL;
CREATE INDEX hotels_updated_idx ON hotels (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX hotels_name_trgm_idx ON hotels USING gin (name gin_trgm_ops);

CREATE TABLE hotel_locations (
  id           BIGSERIAL PRIMARY KEY,
  hotel_id     BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('AREA', 'LANDMARK', 'ATTRACTION', 'TRANSPORT')),
  name         TEXT NOT NULL,
  distance_km  NUMERIC(6, 2) CHECK (distance_km >= 0),
  latitude     NUMERIC(9, 6),
  longitude    NUMERIC(9, 6),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX hotel_locations_hotel_idx ON hotel_locations (hotel_id, kind);

CREATE TABLE hotel_amenities (
  hotel_id   BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  amenity_id SMALLINT NOT NULL REFERENCES amenities (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (hotel_id, amenity_id)
);

CREATE INDEX hotel_amenities_amenity_idx ON hotel_amenities (amenity_id);

CREATE TABLE hotel_images (
  id              BIGSERIAL PRIMARY KEY,
  hotel_id        BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  category        TEXT NOT NULL DEFAULT 'OTHER'
                  CHECK (category IN ('COVER', 'EXTERIOR', 'LOBBY', 'ROOM', 'BATHROOM', 'RESTAURANT', 'POOL', 'GYM', 'FACILITY', 'OTHER')),
  storage_key    TEXT,
  source_url     TEXT,
  source_provider TEXT,
  alt_text       TEXT,
  width          INTEGER CHECK (width > 0),
  height         INTEGER CHECK (height > 0),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_cover       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT hotel_images_has_source CHECK (storage_key IS NOT NULL OR source_url IS NOT NULL)
);

CREATE INDEX hotel_images_hotel_idx ON hotel_images (hotel_id, sort_order) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX hotel_images_one_cover ON hotel_images (hotel_id) WHERE is_cover AND deleted_at IS NULL;

CREATE TABLE hotel_policies (
  id           BIGSERIAL PRIMARY KEY,
  hotel_id     BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  policy_type  TEXT NOT NULL CHECK (policy_type IN ('CHILDREN', 'PETS', 'EXTRA_BED', 'PAYMENT', 'ID_REQUIRED', 'PARKING', 'OTHER')),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, policy_type, title)
);

CREATE TABLE cancellation_policies (
  id                       BIGSERIAL PRIMARY KEY,
  hotel_id                 BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  is_non_refundable        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Full refund when cancelled at least this many hours before check-in.
  free_cancellation_hours  INTEGER CHECK (free_cancellation_hours >= 0),
  -- Refund percentage for cancellations inside the free window.
  partial_refund_percent   SMALLINT NOT NULL DEFAULT 0 CHECK (partial_refund_percent BETWEEN 0 AND 100),
  description              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at               TIMESTAMPTZ,
  CONSTRAINT cancellation_non_refundable_rule CHECK (
    NOT is_non_refundable OR (free_cancellation_hours IS NULL AND partial_refund_percent = 0)
  )
);

CREATE INDEX cancellation_policies_hotel_idx ON cancellation_policies (hotel_id) WHERE deleted_at IS NULL;
