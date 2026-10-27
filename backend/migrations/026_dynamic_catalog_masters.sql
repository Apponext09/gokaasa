-- Dynamic master data for property types, room categories and amenities.
-- Existing code-valued columns are retained so booking/search payloads remain backwards compatible.

CREATE TABLE property_types (
  code        TEXT PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name        TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX property_types_name_unique ON property_types (lower(name));

CREATE TABLE room_categories (
  code        TEXT PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name        TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX room_categories_name_unique ON room_categories (lower(name));

INSERT INTO property_types (code, name, sort_order) VALUES
  ('HOTEL', 'Hotel', 10), ('RESORT', 'Resort', 20), ('VILLA', 'Villa', 30),
  ('APARTMENT', 'Apartment', 40), ('HOSTEL', 'Hostel', 50), ('GUEST_HOUSE', 'Guest house', 60);

INSERT INTO room_categories (code, name, sort_order) VALUES
  ('STANDARD', 'Standard', 10), ('DELUXE', 'Deluxe', 20), ('SUITE', 'Suite', 30),
  ('FAMILY', 'Family', 40), ('VILLA', 'Villa', 50), ('DORM', 'Dormitory', 60), ('OTHER', 'Other', 70);

ALTER TABLE hotels DROP CONSTRAINT IF EXISTS hotels_property_type_check;
ALTER TABLE hotels ADD CONSTRAINT hotels_property_type_fk
  FOREIGN KEY (property_type) REFERENCES property_types (code) ON UPDATE CASCADE;

ALTER TABLE room_types DROP CONSTRAINT IF EXISTS room_types_category_check;
ALTER TABLE room_types ADD CONSTRAINT room_types_category_fk
  FOREIGN KEY (category) REFERENCES room_categories (code) ON UPDATE CASCADE;

ALTER TABLE amenities ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE amenities ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE amenities ADD COLUMN created_by BIGINT REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE amenities ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX amenities_name_unique ON amenities (lower(name));

