
-- Sync assigned_consultant_user_id from primary CSC assignments for all active clients
UPDATE tenants t
SET assigned_consultant_user_id = tca.csc_user_id
FROM tenant_csc_assignments tca
WHERE tca.tenant_id = t.id
  AND tca.is_primary = true
  AND t.status = 'active'
  AND t.assigned_consultant_user_id IS NULL
  AND tca.csc_user_id IS NOT NULL;
