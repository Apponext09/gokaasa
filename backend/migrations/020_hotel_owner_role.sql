-- Phase 1 of the Hotel Partner Portal: self-service partner registration needs its own role, distinct
-- from HOTEL_MANAGER (which is still assigned by an ADMIN only, never self-service).
ALTER TABLE roles DROP CONSTRAINT roles_code_check;
ALTER TABLE roles ADD CONSTRAINT roles_code_check
  CHECK (code IN ('CUSTOMER', 'ADMIN', 'HOTEL_MANAGER', 'HOTEL_OWNER'));

INSERT INTO roles (code, name) VALUES ('HOTEL_OWNER', 'Hotel Owner (Partner)');
