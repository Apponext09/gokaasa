-- Reviews, wishlists, hotel onboarding (import) tracking and audit logging.

CREATE TABLE reviews (
  id          BIGSERIAL PRIMARY KEY,
  hotel_id    BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  booking_id  BIGINT UNIQUE REFERENCES bookings (id) ON DELETE SET NULL,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       TEXT CHECK (char_length(title) <= 150),
  body        TEXT CHECK (char_length(body) <= 4000),
  status      TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED', 'HIDDEN')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, user_id)
);

CREATE INDEX reviews_hotel_idx ON reviews (hotel_id, created_at DESC) WHERE status = 'PUBLISHED';

CREATE TABLE wishlists (
  user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  hotel_id   BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hotel_id)
);

CREATE TABLE external_hotel_sources (
  id              SMALLSERIAL PRIMARY KEY,
  provider        TEXT NOT NULL UNIQUE CHECK (provider ~ '^[a-z_]+$'),
  display_name    TEXT NOT NULL,
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  last_success_at TIMESTAMPTZ,
  last_error_at   TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hotel_import_jobs (
  id                  BIGSERIAL PRIMARY KEY,
  search_query        TEXT NOT NULL CHECK (char_length(search_query) BETWEEN 2 AND 200),
  provider            TEXT NOT NULL,
  external_hotel_id   TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVIEW_REQUIRED')),
  attempts            SMALLINT NOT NULL DEFAULT 0,
  hotel_id            BIGINT REFERENCES hotels (id) ON DELETE SET NULL,
  raw_response        JSONB,
  normalized_data     JSONB,
  error_message       TEXT,
  created_by          BIGINT REFERENCES users (id) ON DELETE SET NULL,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX hotel_import_jobs_status_idx ON hotel_import_jobs (status, created_at);
CREATE INDEX hotel_import_jobs_created_idx ON hotel_import_jobs (created_at DESC);

CREATE TABLE hotel_import_logs (
  id          BIGSERIAL PRIMARY KEY,
  job_id      BIGINT NOT NULL REFERENCES hotel_import_jobs (id) ON DELETE CASCADE,
  level       TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR')),
  message     TEXT NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX hotel_import_logs_job_idx ON hotel_import_logs (job_id, id);

CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT REFERENCES users (id) ON DELETE SET NULL,
  action      TEXT NOT NULL CHECK (char_length(action) BETWEEN 3 AND 80),
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, entity_id);
CREATE INDEX audit_logs_user_idx ON audit_logs (user_id, created_at DESC);
