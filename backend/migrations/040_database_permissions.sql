-- Database-driven RBAC. Route-to-action mapping remains in application code, while the roles that
-- receive each capability are data and can be changed without a deployment.
CREATE TABLE permissions (
  id          BIGSERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_.]*$'),
  name        TEXT NOT NULL,
  module      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id       BIGINT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX role_permissions_permission_idx ON role_permissions (permission_id);

INSERT INTO permissions (code, name, module) VALUES
  ('console.access', 'Access staff console', 'console'),
  ('console.full', 'Access every console area', 'console'),
  ('console.owner', 'Access hotel-owner console areas', 'console'),
  ('console.sales', 'Access sales console areas', 'console'),
  ('console.onboarding', 'Access hotel-onboarding console areas', 'console'),
  ('console.review', 'Access hotel-review console areas', 'console'),
  ('user.manage', 'Manage users and sessions', 'users'),
  ('settings.manage', 'Manage platform settings', 'settings'),
  ('catalog.manage', 'Manage master catalog data', 'catalog'),
  ('homepage.manage', 'Manage homepage media', 'homepage'),
  ('commission.manage', 'Manage commission rates', 'finance'),
  ('settlement.manage', 'Manage settlements', 'finance'),
  ('onboarding.assign', 'Assign onboarding executives', 'hotels'),
  ('offer.manage', 'Create and update offers', 'offers'),
  ('offer.delete', 'Permanently delete offers', 'offers'),
  ('hotel.review', 'Review and decide hotel submissions', 'hotels'),
  ('review.moderate', 'Moderate guest reviews', 'reviews'),
  ('partner.review', 'Review and decide partner applications', 'partners'),
  ('customer.manage', 'Activate and deactivate customer accounts', 'customers'),
  ('audit.read', 'Read platform audit logs', 'audit');

-- ADMIN receives every permission now and automatically receives new permissions when migrations
-- explicitly add them. Other roles receive only the exact capabilities matching their current UI/API.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'ADMIN';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = ANY (ARRAY['console.access', 'console.owner'])
 WHERE r.code = 'HOTEL_OWNER';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = ANY (ARRAY['console.access', 'console.sales', 'offer.manage'])
 WHERE r.code = 'SALES_EXECUTIVE';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = ANY (ARRAY['console.access', 'console.onboarding'])
 WHERE r.code = 'HOTEL_ONBOARDING_EXECUTIVE';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = ANY (ARRAY['console.access', 'console.review', 'hotel.review'])
 WHERE r.code = 'HOTEL_REVIEW_EXECUTIVE';
