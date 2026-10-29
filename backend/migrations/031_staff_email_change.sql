-- Verified self-service email changes for every non-customer account.

CREATE TABLE email_change_requests (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  new_email    CITEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at  TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT (consumed_at IS NOT NULL AND cancelled_at IS NOT NULL))
);

CREATE UNIQUE INDEX email_change_requests_active_user_idx
  ON email_change_requests (user_id)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;

CREATE INDEX email_change_requests_user_created_idx
  ON email_change_requests (user_id, created_at DESC);
