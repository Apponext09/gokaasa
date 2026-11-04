-- Add pets_allowed to hotels
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS pets_allowed BOOLEAN NOT NULL DEFAULT false;

-- Add pets_count to booking_holds and bookings
ALTER TABLE booking_holds ADD COLUMN IF NOT EXISTS pets_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pets_count INTEGER NOT NULL DEFAULT 0;

