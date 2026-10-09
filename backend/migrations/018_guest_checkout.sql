-- Feature 2: guest checkout without mandatory login. A guest still needs a real `users` row
-- (bookings.user_id is NOT NULL and FK'd to users), so this flags which rows were created that way
-- rather than through normal registration -- purely informational/operational, never security-load-
-- bearing (a guest's password_hash is always an unusable random value; login() rejects them naturally
-- via the existing bcrypt compare, with no special-casing needed).
ALTER TABLE users ADD COLUMN is_guest BOOLEAN NOT NULL DEFAULT FALSE;
