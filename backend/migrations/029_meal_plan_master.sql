-- Dynamic meal-plan master. Existing codes and behavior are preserved while new plans can be added
-- without changing database CHECK constraints or application enums.

CREATE TABLE meal_plans (
  code               TEXT PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name               TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  includes_breakfast BOOLEAN NOT NULL DEFAULT FALSE,
  includes_lunch     BOOLEAN NOT NULL DEFAULT FALSE,
  includes_dinner    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_by         BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX meal_plans_name_unique ON meal_plans (lower(name));

INSERT INTO meal_plans (code, name, includes_breakfast, includes_lunch, includes_dinner, sort_order) VALUES
  ('ROOM_ONLY', 'Room only', FALSE, FALSE, FALSE, 10),
  ('BREAKFAST', 'Breakfast included', TRUE, FALSE, FALSE, 20),
  ('HALF_BOARD', 'Half board', TRUE, FALSE, TRUE, 30),
  ('FULL_BOARD', 'Full board', TRUE, TRUE, TRUE, 40);

ALTER TABLE rate_plans DROP CONSTRAINT IF EXISTS rate_plans_meal_plan_check;
ALTER TABLE rate_plans ADD CONSTRAINT rate_plans_meal_plan_fk
  FOREIGN KEY (meal_plan) REFERENCES meal_plans (code);

ALTER TABLE booking_rooms DROP CONSTRAINT IF EXISTS booking_rooms_meal_plan_check;
ALTER TABLE booking_rooms ADD CONSTRAINT booking_rooms_meal_plan_fk
  FOREIGN KEY (meal_plan) REFERENCES meal_plans (code);

-- This legacy booking-level snapshot is nullable, but any value present must still be a real plan.
ALTER TABLE bookings ADD CONSTRAINT bookings_meal_plan_fk
  FOREIGN KEY (meal_plan) REFERENCES meal_plans (code);
