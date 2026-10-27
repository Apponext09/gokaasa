-- Dynamic master data for room bed types and hotel image categories.
-- Existing codes are seeded unchanged so API payloads and stored records remain backwards compatible.

CREATE TABLE bed_types (
  code        TEXT PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name        TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX bed_types_name_unique ON bed_types (lower(name));

CREATE TABLE image_categories (
  code        TEXT PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name        TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX image_categories_name_unique ON image_categories (lower(name));

INSERT INTO bed_types (code, name, sort_order) VALUES
  ('KING', 'King', 10), ('QUEEN', 'Queen', 20), ('DOUBLE', 'Double', 30),
  ('TWIN', 'Twin', 40), ('SINGLE', 'Single', 50), ('SOFA_BED', 'Sofa bed', 60),
  ('BUNK', 'Bunk', 70);

INSERT INTO image_categories (code, name, sort_order) VALUES
  ('EXTERIOR', 'Exterior', 10), ('LOBBY', 'Lobby', 20), ('ROOM', 'Room', 30),
  ('BATHROOM', 'Bathroom', 40), ('RESTAURANT', 'Restaurant', 50), ('POOL', 'Pool', 60),
  ('GYM', 'Gym', 70), ('SPA', 'Spa', 80), ('OTHER', 'Other', 90);

ALTER TABLE room_types DROP CONSTRAINT IF EXISTS room_types_bed_type_check;
ALTER TABLE room_types ADD CONSTRAINT room_types_bed_type_fk
  FOREIGN KEY (bed_type) REFERENCES bed_types (code) ON UPDATE CASCADE;

ALTER TABLE hotel_images DROP CONSTRAINT IF EXISTS hotel_images_category_check;
ALTER TABLE hotel_images ADD CONSTRAINT hotel_images_category_fk
  FOREIGN KEY (category) REFERENCES image_categories (code) ON UPDATE CASCADE;
