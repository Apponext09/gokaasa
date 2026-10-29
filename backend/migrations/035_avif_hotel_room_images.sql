-- Hotel and room photo uploads now accept AVIF alongside JPEG/PNG/WebP. Existing images and rows are
-- untouched; this only widens the allow-list the two mime_type CHECK constraints enforce. Postgres has
-- no ALTER CHECK, so the constraint is dropped and recreated with the same name.

ALTER TABLE hotel_images DROP CONSTRAINT hotel_images_mime_type_check;
ALTER TABLE hotel_images ADD CONSTRAINT hotel_images_mime_type_check
  CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif'));

ALTER TABLE room_images DROP CONSTRAINT room_images_mime_type_check;
ALTER TABLE room_images ADD CONSTRAINT room_images_mime_type_check
  CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif'));
