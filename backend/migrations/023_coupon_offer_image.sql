-- One promotional image per coupon. The file bytes live in media storage; this stores only the
-- server-generated key used to resolve its public URL.
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS image_storage_key TEXT;
