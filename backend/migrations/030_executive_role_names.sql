-- Rename the two internal staff roles without changing their role ids, so existing
-- user_roles assignments continue to point to the same records.

ALTER TABLE roles DROP CONSTRAINT roles_code_check;

UPDATE roles
   SET code = 'SALES_EXECUTIVE', name = 'Sales Executive'
 WHERE code = 'SALES_AGENT';

UPDATE roles
   SET code = 'HOTEL_ONBOARDING_EXECUTIVE', name = 'Hotel Onboarding Executive'
 WHERE code = 'HOTEL_ONBOARDING_AGENT';

-- Also normalise display names when this migration runs on a fresh database whose
-- migration 028 already contains the new codes.
UPDATE roles SET name = 'Sales Executive' WHERE code = 'SALES_EXECUTIVE';
UPDATE roles SET name = 'Hotel Onboarding Executive' WHERE code = 'HOTEL_ONBOARDING_EXECUTIVE';

ALTER TABLE roles ADD CONSTRAINT roles_code_check
  CHECK (code IN ('CUSTOMER', 'ADMIN', 'HOTEL_MANAGER', 'HOTEL_OWNER', 'SALES_EXECUTIVE', 'HOTEL_ONBOARDING_EXECUTIVE'));
