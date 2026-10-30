ALTER TABLE homepage_background_images
  ADD COLUMN hero_text TEXT NOT NULL DEFAULT '',
  ADD CONSTRAINT homepage_background_images_hero_text_length
    CHECK (char_length(hero_text) <= 160);
