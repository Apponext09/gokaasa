-- Identity, roles and token tables.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE roles (
  id          SMALLSERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE CHECK (code IN ('CUSTOMER', 'ADMIN', 'HOTEL_MANAGER')),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO roles (code, name) VALUES
  ('CUSTOMER', 'Customer'),
  ('ADMIN', 'Administrator'),
  ('HOTEL_MANAGER', 'Hotel Manager');

CREATE TABLE users (
  id                BIGSERIAL PRIMARY KEY,
  email             CITEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  first_name        TEXT NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 80),
  last_name         TEXT NOT NULL CHECK (char_length(last_name) BETWEEN 1 AND 80),
  phone             TEXT,
  email_verified_at TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX users_active_idx ON users (is_active) WHERE deleted_at IS NULL;

CREATE TABLE user_roles (
  user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id     SMALLINT NOT NULL REFERENCES roles (id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE refresh_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  replaced_by BIGINT REFERENCES refresh_tokens (id),
  user_agent  TEXT,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

CREATE TABLE password_reset_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);
