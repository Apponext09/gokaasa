-- Phase 2: Commission & Settlement Ledger. Append-only; nothing here is ever UPDATEd except
-- partner_ledger_entries.settlement_id (set exactly once, from NULL, when a batch claims an entry) and
-- booking_commissions.status (flipped ACTIVE -> REVERSED exactly once, by a full refund). All monetary
-- amounts are exact BIGINT minor units; commission_rate_applied/rate_percent are NUMERIC(5,2) percentages
-- (a multiplier, not money) -- see commission.service.js for why that's still exact-enough for rounding.

-- Commission rate configuration. Every change is a NEW row, never an UPDATE; "effective now" is resolved
-- by query (latest row with effective_from <= now(), hotel-specific beating the global default), which
-- is itself the full audit trail -- no separate history table. hotel_id NULL = platform default.
CREATE TABLE commission_configs (
  id              BIGSERIAL PRIMARY KEY,
  hotel_id        BIGINT REFERENCES hotels (id) ON DELETE CASCADE,
  rate_percent    NUMERIC(5,2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  effective_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason          TEXT CHECK (char_length(reason) <= 300),
  created_by      BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX commission_configs_resolve_idx ON commission_configs (hotel_id, effective_from DESC);

-- Initial default business assumption (spec: 15%), configurable afterwards -- never hardcoded elsewhere.
INSERT INTO commission_configs (hotel_id, rate_percent, reason) VALUES (NULL, 15.00, 'Initial platform default');

-- Settlement batches (payouts to a hotel). Full spec status enum kept for forward-compatibility; Phase 2
-- only actually drives DRAFT -> APPROVED -> PAID -> REVERSED (see commission.service.js / settlementStatus.js
-- for why: only one staff tier, ADMIN, has write access today, so there is no real two-person
-- maker-checker flow to attach PENDING_APPROVAL/PROCESSING/FAILED to yet).
CREATE TABLE settlements (
  id                BIGSERIAL PRIMARY KEY,
  hotel_id          BIGINT NOT NULL REFERENCES hotels (id),
  status            TEXT NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PROCESSING','PAID','FAILED','REVERSED')),
  currency          CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total_minor       BIGINT NOT NULL CHECK (total_minor >= 0),
  created_by        BIGINT REFERENCES users (id) ON DELETE SET NULL,
  approved_by       BIGINT REFERENCES users (id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  payout_reference  TEXT CHECK (char_length(payout_reference) <= 120),
  reversed_at       TIMESTAMPTZ,
  notes             TEXT CHECK (char_length(notes) <= 500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX settlements_hotel_idx ON settlements (hotel_id, created_at DESC);

-- The append-only double-entry ledger. direction is from the HOTEL's perspective: CREDIT increases what
-- Gokaasa owes the hotel, DEBIT decreases it. settlement_id is the one-time, permanent "claimed by this
-- batch" marker -- "available to settle" for a hotel is always SUM(entries WHERE settlement_id IS NULL).
CREATE TABLE partner_ledger_entries (
  id              BIGSERIAL PRIMARY KEY,
  hotel_id        BIGINT NOT NULL REFERENCES hotels (id),
  booking_id      BIGINT REFERENCES bookings (id),
  refund_id       BIGINT REFERENCES refunds (id),
  settlement_id   BIGINT REFERENCES settlements (id),
  entry_type      TEXT NOT NULL CHECK (entry_type IN
                   ('BOOKING_EARNING','PLATFORM_COMMISSION','REFUND_ADJUSTMENT','COMMISSION_REVERSAL',
                    'SETTLEMENT_DEBIT','SETTLEMENT_REVERSAL','MANUAL_ADJUSTMENT')),
  direction       TEXT NOT NULL CHECK (direction IN ('CREDIT','DEBIT')),
  amount_minor    BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency        CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  idempotency_key TEXT UNIQUE,
  description     TEXT CHECK (char_length(description) <= 300),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX partner_ledger_entries_hotel_idx ON partner_ledger_entries (hotel_id, created_at DESC);
CREATE INDEX partner_ledger_entries_unclaimed_idx ON partner_ledger_entries (hotel_id, id) WHERE settlement_id IS NULL;
CREATE INDEX partner_ledger_entries_booking_idx ON partner_ledger_entries (booking_id);

-- One immutable snapshot row per booking, created the instant it reaches CONFIRMED. status is the only
-- field ever mutated after insert (ACTIVE -> REVERSED by a full refund); every amount/rate column is
-- fixed forever at creation, which is how a historical booking keeps the rate that applied when it
-- became eligible even after commission_configs changes later.
CREATE TABLE booking_commissions (
  id                              BIGSERIAL PRIMARY KEY,
  booking_id                      BIGINT NOT NULL UNIQUE REFERENCES bookings (id),
  hotel_id                        BIGINT NOT NULL REFERENCES hotels (id),
  payment_id                      BIGINT NOT NULL REFERENCES payments (id),
  currency                        CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  eligible_accommodation_minor    BIGINT NOT NULL CHECK (eligible_accommodation_minor >= 0),
  commission_rate_applied         NUMERIC(5,2) NOT NULL CHECK (commission_rate_applied >= 0 AND commission_rate_applied <= 100),
  commission_minor                BIGINT NOT NULL CHECK (commission_minor >= 0),
  hotel_earnings_minor            BIGINT NOT NULL CHECK (hotel_earnings_minor >= 0),
  -- Informational only (platform-issued coupon cost) -- never a ledger entry, never reduces
  -- hotel_earnings_minor. See migration 016's own comment distinguishing discount_minor (hotel-funded,
  -- already subtracted into eligible_accommodation_minor) from coupon_discount_minor (platform-funded).
  platform_discount_cost_minor    BIGINT NOT NULL DEFAULT 0 CHECK (platform_discount_cost_minor >= 0),
  status                          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVERSED')),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at                     TIMESTAMPTZ,
  CONSTRAINT booking_commissions_split CHECK (eligible_accommodation_minor = commission_minor + hotel_earnings_minor)
);
CREATE INDEX booking_commissions_hotel_idx ON booking_commissions (hotel_id, created_at DESC);

-- Immutable, detailed "what's in this batch" record -- a second, defense-in-depth guarantee (on top of
-- the settlement_id claim column above) against the same ledger entry ever being double-allocated.
CREATE TABLE settlement_line_items (
  id              BIGSERIAL PRIMARY KEY,
  settlement_id   BIGINT NOT NULL REFERENCES settlements (id),
  ledger_entry_id BIGINT NOT NULL UNIQUE REFERENCES partner_ledger_entries (id),
  amount_minor    BIGINT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX settlement_line_items_settlement_idx ON settlement_line_items (settlement_id);
