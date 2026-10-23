-- Self-service partner (HOTEL_OWNER) registration: business/KYC profile, verification documents and
-- OTP codes. partner_profiles.status is the account-level approval gate that the /api/admin/* staff
-- middleware checks for HOTEL_OWNER; it is independent of hotel_managers, which still controls which
-- hotels a user may act on (unchanged).

CREATE TABLE partner_profiles (
  user_id           BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED')),
  business_name     TEXT NOT NULL CHECK (char_length(business_name) BETWEEN 1 AND 200),
  business_type     TEXT NOT NULL CHECK (business_type IN ('INDIVIDUAL', 'PARTNERSHIP', 'PRIVATE_LIMITED', 'LLP', 'OTHER')),
  gstin             TEXT,
  pan               TEXT,
  contact_phone     TEXT NOT NULL,
  property_name     TEXT NOT NULL,
  property_city     TEXT NOT NULL,
  property_address  TEXT,
  estimated_rooms   INTEGER CHECK (estimated_rooms > 0),
  submitted_at      TIMESTAMPTZ,
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       BIGINT REFERENCES users (id) ON DELETE SET NULL,
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX partner_profiles_status_idx ON partner_profiles (status);

CREATE TABLE partner_documents (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  doc_type      TEXT NOT NULL CHECK (doc_type IN ('BUSINESS_REGISTRATION', 'GOVERNMENT_ID', 'PROPERTY_OWNERSHIP_OR_LEASE', 'OTHER')),
  storage_key   TEXT NOT NULL UNIQUE,
  mime_type     TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  byte_size     INTEGER NOT NULL CHECK (byte_size > 0),
  content_hash  TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX partner_documents_user_idx ON partner_documents (user_id) WHERE deleted_at IS NULL;

-- Generic enough to carry future OTP purposes; only PARTNER_EMAIL_VERIFY is used in Phase 1.
CREATE TABLE otp_codes (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose      TEXT NOT NULL CHECK (purpose IN ('PARTNER_EMAIL_VERIFY')),
  code_hash    TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX otp_codes_active_idx ON otp_codes (user_id, purpose) WHERE consumed_at IS NULL;
