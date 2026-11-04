-- Migration 043: Create booking_extensions table for room stay extensions

CREATE TABLE IF NOT EXISTS booking_extensions (
    id SERIAL PRIMARY KEY,
    booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    original_check_out DATE NOT NULL,
    extended_check_out DATE NOT NULL,
    additional_nights INT NOT NULL,
    additional_amount_minor BIGINT NOT NULL,
    payment_id INT REFERENCES payments(id),
    status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_extensions_booking_id ON booking_extensions(booking_id);

-- Drop legacy partial index that prevented multiple successful payments per booking
DROP INDEX IF EXISTS payments_one_success_per_booking;

-- Grants
GRANT SELECT, INSERT, UPDATE ON booking_extensions TO PUBLIC;
GRANT USAGE, SELECT ON SEQUENCE booking_extensions_id_seq TO PUBLIC;
