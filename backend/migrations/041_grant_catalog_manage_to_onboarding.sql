-- Grant catalog management permission to HOTEL_ONBOARDING_EXECUTIVE
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code = 'catalog.manage'
 WHERE r.code = 'HOTEL_ONBOARDING_EXECUTIVE'
ON CONFLICT DO NOTHING;

