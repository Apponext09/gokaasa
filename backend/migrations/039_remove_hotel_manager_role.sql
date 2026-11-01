-- HOTEL_MANAGER is retired. HOTEL_OWNER now represents property operators, while hotel_managers
-- remains the assignment table that scopes an owner to its own properties.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
     WHERE r.code = 'HOTEL_MANAGER'
  ) THEN
    RAISE EXCEPTION 'Cannot remove HOTEL_MANAGER while user assignments still exist';
  END IF;
END $$;

DELETE FROM roles WHERE code = 'HOTEL_MANAGER';

ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_code_check;
ALTER TABLE roles ADD CONSTRAINT roles_code_check CHECK (code IN (
  'CUSTOMER', 'ADMIN', 'HOTEL_OWNER', 'SALES_EXECUTIVE',
  'HOTEL_ONBOARDING_EXECUTIVE', 'HOTEL_REVIEW_EXECUTIVE'
));
