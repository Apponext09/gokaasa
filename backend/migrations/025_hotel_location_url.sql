-- Customer-facing map link supplied by an administrator. Coordinates remain nullable legacy/internal
-- data because nearby search still uses them for imported hotels, but the manual form no longer asks for them.
ALTER TABLE hotels
  ADD COLUMN location_url TEXT
  CHECK (location_url IS NULL OR char_length(location_url) <= 1000);
