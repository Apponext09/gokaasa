-- Phase 6: a minimal, honest newsletter subscription store -- no frontend-only localStorage persistence.
-- citext (already enabled in 001_auth.sql) gives case-insensitive uniqueness the same way users.email does.

CREATE TABLE newsletter_subscribers (
  id              BIGSERIAL PRIMARY KEY,
  email           CITEXT NOT NULL UNIQUE,
  subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ
);
