-- Amenities use one shared master. Hotels and room types independently choose any subset.
-- IF EXISTS makes this safe both after the short-lived scoped-amenity migration and on fresh databases.
ALTER TABLE amenities DROP COLUMN IF EXISTS applicability;
