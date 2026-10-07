-- Phase 7: a persisted, queryable notification per user (customer, hotel manager or admin), distinct from
-- the existing fire-and-forget email trigger in src/notifications/notificationService.js, which this
-- migration gives a durable home to read later (the bell/dropdown) instead of only ever being logged.

CREATE TABLE notifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (char_length(type) BETWEEN 3 AND 60),
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  message     TEXT NOT NULL CHECK (char_length(message) <= 1000),
  entity_type TEXT CHECK (entity_type IS NULL OR char_length(entity_type) <= 40),
  entity_id   BIGINT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The notification list (always ordered newest-first) and the unread-count/bell badge are the two reads.
CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
