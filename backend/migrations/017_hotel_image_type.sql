-- Distinguishes a real property photo from a generic, clearly-labelled illustrative placeholder.
-- Every existing image (every past upload and provider import) is a real photo of that property, so
-- the default preserves their meaning exactly -- this is purely additive, nothing already published is
-- reclassified or re-evaluated differently.
ALTER TABLE hotel_images ADD COLUMN image_type TEXT NOT NULL DEFAULT 'REAL_PROPERTY'
  CHECK (image_type IN ('REAL_PROPERTY', 'ILLUSTRATIVE'));
