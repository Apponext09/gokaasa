-- Phase 8: a minimal, admin-editable settings store. Deliberately NOT a dumping ground for config/index.js
-- (which holds secrets -- DB password, JWT secret, Razorpay keys, SMTP credentials) -- only genuinely safe,
-- public-facing contact fields live here. Everything else the Settings page shows (hold duration, business
-- timezone, whether SMTP is configured) stays read-only, sourced from the existing env config at request time.

CREATE TABLE platform_settings (
  key        TEXT PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 60),
  value      TEXT NOT NULL CHECK (char_length(value) <= 500),
  updated_by BIGINT REFERENCES users (id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_settings (key, value) VALUES
  ('company_name', 'Gokaasa'),
  ('support_phone', '+91-9876543210'),
  ('support_email', 'support@gokaasa.com');
