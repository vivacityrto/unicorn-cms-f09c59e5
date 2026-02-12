
-- Fix security definer view by recreating with security_invoker = true
CREATE OR REPLACE VIEW public.vw_consultant_capacity
WITH (security_invoker = true)
AS
SELECT
  tm.tenant_id,
  u.user_uuid,
  public.compute_consultant_weekly_capacity(u.user_uuid) AS weekly_assignable_hours
FROM users u
JOIN tenant_members tm ON tm.user_id = u.user_uuid AND tm.status = 'active'
WHERE u.is_vivacity_internal = true
  AND u.disabled = false;
