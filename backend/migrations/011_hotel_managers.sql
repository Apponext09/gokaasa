-- Phase 4: HOTEL_MANAGER was a global role with no per-hotel scoping (any manager could act on any
-- hotel). This table makes it per-hotel. ADMIN is unaffected everywhere (it always bypasses this check).
CREATE TABLE hotel_managers (
  user_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  hotel_id     BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by  BIGINT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, hotel_id)
);

CREATE INDEX hotel_managers_hotel_idx ON hotel_managers (hotel_id);
