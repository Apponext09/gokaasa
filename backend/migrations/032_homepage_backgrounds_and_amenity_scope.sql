-- Homepage hero background-image master.

CREATE TABLE homepage_background_images (
  slot         SMALLINT PRIMARY KEY CHECK (slot BETWEEN 1 AND 4),
  storage_key  TEXT NOT NULL,
  alt_text     TEXT NOT NULL DEFAULT '',
  mime_type    TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size    INTEGER NOT NULL CHECK (byte_size > 0),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_by   BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

