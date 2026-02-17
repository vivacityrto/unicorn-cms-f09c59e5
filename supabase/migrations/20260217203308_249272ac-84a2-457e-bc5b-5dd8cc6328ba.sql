-- Step 5: Insert missing tenant_users records
INSERT INTO tenant_users (tenant_id, user_id, role, primary_contact)
SELECT 
  u1.u2_tenant_id,
  u1.mapped_user_uuid,
  'parent',
  true
FROM unicorn1.users u1
WHERE u1.mapped_user_uuid IS NOT NULL
  AND u1.u2_tenant_id IS NOT NULL
  AND u1."Discriminator" = 'Client'
  AND NOT EXISTS (
    SELECT 1 FROM tenant_users tu 
    WHERE tu.user_id = u1.mapped_user_uuid 
      AND tu.tenant_id = u1.u2_tenant_id
  )
ON CONFLICT DO NOTHING;