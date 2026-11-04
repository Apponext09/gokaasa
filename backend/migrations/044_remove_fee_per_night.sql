-- Migration 044: Remove extra fee per night from rate plans and nightly rate prices

ALTER TABLE rate_plans DROP COLUMN IF EXISTS fee_minor;
ALTER TABLE rate_prices DROP COLUMN IF EXISTS fee_minor;

