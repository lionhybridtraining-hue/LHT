-- Assign admin role to user (pcoach.libanio@gmail.com)
-- Run this after supabase-schema.sql has been applied
-- Replace the identity_id with your actual Supabase Auth user UUID if different

INSERT INTO user_roles (identity_id, role_id)
VALUES (
'507cf790-0c9d-4a2c-81cc-bfc50cc7ad06',
(SELECT id FROM app_roles WHERE name = 'admin')
)
ON CONFLICT DO NOTHING;

-- Verify the role was assigned:
-- SELECT ur.identity_id, ar.name FROM user_roles ur 
-- JOIN app_roles ar ON ar.id = ur.role_id 
-- WHERE ur.identity_id = '507cf790-0c9d-4a2c-81cc-bfc50cc7ad06';
