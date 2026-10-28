-- Restricted internal staff roles and per-hotel onboarding assignments.

ALTER TABLE roles DROP CONSTRAINT roles_code_check;
ALTER TABLE roles ADD CONSTRAINT roles_code_check
  CHECK (code IN ('CUSTOMER', 'ADMIN', 'HOTEL_MANAGER', 'HOTEL_OWNER', 'SALES_EXECUTIVE', 'HOTEL_ONBOARDING_EXECUTIVE'));

INSERT INTO roles (code, name) VALUES
  ('SALES_EXECUTIVE', 'Sales Executive'),
  ('HOTEL_ONBOARDING_EXECUTIVE', 'Hotel Onboarding Executive')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE hotel_onboarding_assignments (
  user_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  hotel_id     BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by  BIGINT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, hotel_id)
);

CREATE INDEX hotel_onboarding_assignments_hotel_idx ON hotel_onboarding_assignments (hotel_id);
