-- Presence/session tracking for the admin User Management dashboard. One row per authenticated
-- browser tab/device session (not per auth refresh token): a user can hold several active rows at once.

CREATE TABLE user_sessions (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  platform             TEXT NOT NULL DEFAULT 'web' CHECK (platform IN ('web', 'android', 'ios')),
  browser              TEXT,
  os                   TEXT,
  current_route        TEXT,
  current_route_label  TEXT,
  started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at             TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_sessions_user_idx ON user_sessions (user_id);
-- Both the online-threshold query and the cleanup sweep only ever look at rows that are still open.
CREATE INDEX user_sessions_active_idx ON user_sessions (user_id, last_heartbeat_at) WHERE ended_at IS NULL;
CREATE INDEX user_sessions_heartbeat_idx ON user_sessions (last_heartbeat_at) WHERE ended_at IS NULL;
