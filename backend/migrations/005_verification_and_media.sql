-- Field provenance and verification, managed image uploads, discardable imports.

-- Per-field provenance. Absence of a row means the value was never tracked (e.g. hotels created before
-- this migration), and such fields are treated as protected: sync never overwrites them.
CREATE TABLE hotel_field_states (
  hotel_id               BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  field                  TEXT NOT NULL CHECK (field ~ '^[a-zA-Z]+$'),
  source                 TEXT NOT NULL CHECK (source IN ('EXTERNAL', 'NORMALIZED', 'MANUALLY_MODIFIED')),
  external_value         TEXT,
  -- A newer provider value that differs from a protected field. Shown to the admin, never applied automatically.
  pending_external_value TEXT,
  verified_at            TIMESTAMPTZ,
  verified_by            BIGINT REFERENCES users (id) ON DELETE SET NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (hotel_id, field)
);

-- Image categories follow the spec. "Cover" is now an explicit flag, not a category.
ALTER TABLE hotel_images DROP CONSTRAINT IF EXISTS hotel_images_category_check;
UPDATE hotel_images SET category = 'OTHER' WHERE category IN ('COVER', 'FACILITY');
ALTER TABLE hotel_images ADD CONSTRAINT hotel_images_category_check
  CHECK (category IN ('EXTERIOR', 'LOBBY', 'ROOM', 'BATHROOM', 'RESTAURANT', 'POOL', 'GYM', 'SPA', 'OTHER'));

ALTER TABLE hotel_images ADD COLUMN origin TEXT NOT NULL DEFAULT 'IMPORTED' CHECK (origin IN ('IMPORTED', 'UPLOADED'));
ALTER TABLE hotel_images ADD COLUMN mime_type TEXT CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'));
ALTER TABLE hotel_images ADD COLUMN byte_size INTEGER CHECK (byte_size > 0);
ALTER TABLE hotel_images ADD COLUMN content_hash TEXT CHECK (content_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE hotel_images ADD COLUMN created_by BIGINT REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE hotel_images ADD CONSTRAINT hotel_images_uploaded_has_storage
  CHECK (origin <> 'UPLOADED' OR storage_key IS NOT NULL);

-- The same file cannot be uploaded twice to one hotel.
CREATE UNIQUE INDEX hotel_images_upload_hash_unique ON hotel_images (hotel_id, content_hash)
  WHERE content_hash IS NOT NULL AND deleted_at IS NULL;

-- Import jobs can be discarded by an admin before publication.
ALTER TABLE hotel_import_jobs DROP CONSTRAINT IF EXISTS hotel_import_jobs_status_check;
ALTER TABLE hotel_import_jobs ADD CONSTRAINT hotel_import_jobs_status_check
  CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVIEW_REQUIRED', 'DISCARDED'));
