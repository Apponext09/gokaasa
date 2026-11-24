-- Migration 047: Add source_platform to booking_holds for analytics.
-- Additive only: nullable column, no existing rows affected, no data loss.
-- Rollback: ALTER TABLE booking_holds DROP COLUMN IF EXISTS source_platform;

ALTER TABLE booking_holds
  ADD COLUMN IF NOT EXISTS source_platform TEXT
  CHECK (source_platform IN ('WEB', 'MOBILE', 'API'));

COMMENT ON COLUMN booking_holds.source_platform IS
  'Analytics only. Which client created the hold: WEB, MOBILE or API. '
  'NOT used for filtering visibility — a hold created on WEB is equally visible '
  'on MOBILE and vice versa, because holds are keyed by user_id.';
