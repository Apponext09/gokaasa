-- A dedicated internal hotel-review workflow. Guest reviews remain in `reviews`.

ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_code_check;
ALTER TABLE roles ADD CONSTRAINT roles_code_check CHECK (code IN (
  'CUSTOMER', 'ADMIN', 'HOTEL_MANAGER', 'HOTEL_OWNER', 'SALES_EXECUTIVE',
  'HOTEL_ONBOARDING_EXECUTIVE', 'HOTEL_REVIEW_EXECUTIVE'
));

INSERT INTO roles (code, name)
VALUES ('HOTEL_REVIEW_EXECUTIVE', 'Hotel Review Executive')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

ALTER TABLE hotels DROP CONSTRAINT IF EXISTS hotels_status_check;
ALTER TABLE hotels ADD CONSTRAINT hotels_status_check CHECK (status IN (
  'DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'READY_TO_PUBLISH',
  'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'
));

CREATE TABLE hotel_reviews (
  id                    BIGSERIAL PRIMARY KEY,
  hotel_id              BIGINT NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  round_number          INTEGER NOT NULL CHECK (round_number > 0),
  submission_count      INTEGER NOT NULL DEFAULT 1 CHECK (submission_count > 0),
  status                TEXT NOT NULL CHECK (status IN ('PENDING', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED')),
  submitted_by          BIGINT REFERENCES users (id) ON DELETE SET NULL,
  assigned_reviewer_id  BIGINT REFERENCES users (id) ON DELETE SET NULL,
  reviewed_by           BIGINT REFERENCES users (id) ON DELETE SET NULL,
  decision_summary      TEXT,
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at           TIMESTAMPTZ,
  approved_at           TIMESTAMPTZ,
  published_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, round_number)
);

CREATE INDEX hotel_reviews_queue_idx ON hotel_reviews (status, assigned_reviewer_id, submitted_at DESC);
CREATE INDEX hotel_reviews_hotel_idx ON hotel_reviews (hotel_id, round_number DESC);

CREATE TABLE hotel_review_issues (
  id           BIGSERIAL PRIMARY KEY,
  review_id    BIGINT NOT NULL REFERENCES hotel_reviews (id) ON DELETE CASCADE,
  section      TEXT NOT NULL CHECK (section IN ('OVERVIEW', 'LOCATION', 'IMAGES', 'AMENITIES', 'ROOMS', 'POLICIES', 'OTHER')),
  field_name   TEXT,
  severity     TEXT NOT NULL DEFAULT 'REQUIRED' CHECK (severity IN ('REQUIRED', 'SUGGESTION')),
  comment      TEXT NOT NULL CHECK (char_length(comment) BETWEEN 3 AND 2000),
  status       TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'FIXED_BY_ONBOARDING', 'VERIFIED', 'REOPENED')),
  created_by   BIGINT REFERENCES users (id) ON DELETE SET NULL,
  fixed_by     BIGINT REFERENCES users (id) ON DELETE SET NULL,
  verified_by  BIGINT REFERENCES users (id) ON DELETE SET NULL,
  fixed_at     TIMESTAMPTZ,
  verified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX hotel_review_issues_review_idx ON hotel_review_issues (review_id, status, created_at);

CREATE TABLE hotel_review_events (
  id          BIGSERIAL PRIMARY KEY,
  review_id   BIGINT NOT NULL REFERENCES hotel_reviews (id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN (
    'SUBMITTED', 'RESUBMITTED', 'ASSIGNED', 'ISSUE_ADDED', 'ISSUE_FIXED',
    'ISSUE_VERIFIED', 'ISSUE_REOPENED', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED'
  )),
  actor_id    BIGINT REFERENCES users (id) ON DELETE SET NULL,
  message     TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX hotel_review_events_review_idx ON hotel_review_events (review_id, created_at, id);

-- Existing live hotels were already accepted under the previous workflow. Preserve that approval
-- so an unpublish/re-publish does not unexpectedly lock a valid property.
INSERT INTO hotel_reviews (
  hotel_id, round_number, status, submitted_by, reviewed_by, decision_summary,
  submitted_at, reviewed_at, approved_at, published_at
)
SELECT h.id, 1, CASE WHEN h.status = 'PUBLISHED' THEN 'PUBLISHED' ELSE 'APPROVED' END,
       h.created_by, h.updated_by, 'Migrated from the previous publication workflow',
       h.created_at, h.updated_at, h.updated_at,
       CASE WHEN h.status = 'PUBLISHED' THEN COALESCE(h.published_at, h.updated_at) ELSE NULL END
  FROM hotels h
 WHERE h.deleted_at IS NULL AND h.status IN ('PUBLISHED', 'UNPUBLISHED');

-- READY_TO_PUBLISH records must pass through the new reviewer decision once.
UPDATE hotels SET status = 'PENDING_REVIEW', updated_at = now() WHERE status = 'READY_TO_PUBLISH';

INSERT INTO hotel_reviews (hotel_id, round_number, status, submitted_by, submitted_at)
SELECT h.id, 1, 'PENDING', h.updated_by, h.updated_at
  FROM hotels h
 WHERE h.deleted_at IS NULL AND h.status = 'PENDING_REVIEW'
   AND NOT EXISTS (SELECT 1 FROM hotel_reviews r WHERE r.hotel_id = h.id);

