-- Durable transactional-email outbox. One row represents one event/recipient delivery, so a retry of
-- the business operation cannot send the same email twice and a partial multi-recipient failure can be
-- retried independently. ACCEPTED means the SMTP provider accepted the message, not final inbox delivery.
CREATE TABLE email_deliveries (
  id                  BIGSERIAL PRIMARY KEY,
  event_key           TEXT NOT NULL CHECK (char_length(event_key) BETWEEN 3 AND 200),
  event_type          TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 80),
  recipient_type      TEXT NOT NULL CHECK (recipient_type IN ('CUSTOMER', 'HOTEL', 'ADMIN', 'PARTNER')),
  recipient_email     CITEXT NOT NULL,
  template            TEXT NOT NULL CHECK (char_length(template) BETWEEN 3 AND 80),
  payload             JSONB NOT NULL,
  status              TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'PROCESSING', 'ACCEPTED', 'FAILED')),
  attempt_count       INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts        INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_message_id TEXT,
  last_error          TEXT,
  accepted_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_key, recipient_type, recipient_email)
);

CREATE INDEX email_deliveries_due_idx
  ON email_deliveries (next_attempt_at, id)
  WHERE status IN ('PENDING', 'FAILED');

