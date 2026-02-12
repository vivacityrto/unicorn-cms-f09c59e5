
-- Drop and recreate the diagnostics view (column set changed)
DROP VIEW IF EXISTS public.vw_client_capacity_diagnostics CASCADE;

CREATE VIEW public.vw_client_capacity_diagnostics
WITH (security_invoker = true)
AS
SELECT
  t.id AS tenant_id,
  t.id AS client_id,
  t.name AS client_name,
  COALESCE(mtcc.tier_label, 'Unknown') AS tier_name,
  t.status,
  (mtcc.id IS NOT NULL) AS has_tier_config,
  COALESCE(mtcc.weekly_required_hours, 0) AS base_weekly_required,
  CASE
    WHEN EXTRACT(EPOCH FROM (now() - COALESCE(t.client_onboarded_at, t.created_at))) / 86400.0 <= 28 THEN 2.0
    WHEN EXTRACT(EPOCH FROM (now() - COALESCE(t.client_onboarded_at, t.created_at))) / 86400.0 <= 56 THEN 1.5
    ELSE 1.0
  END AS onboarding_multiplier,
  compute_client_weekly_required(t.id) AS computed_weekly_required
FROM tenants t
LEFT JOIN LATERAL (
  SELECT pi.package_id
  FROM package_instances pi
  JOIN membership_tier_capacity_config m ON pi.package_id = ANY(m.package_ids)
  WHERE pi.tenant_id = t.id AND pi.is_complete = false
  ORDER BY m.weekly_required_hours DESC
  LIMIT 1
) mem_pkg ON true
LEFT JOIN membership_tier_capacity_config mtcc ON mem_pkg.package_id = ANY(mtcc.package_ids)
WHERE t.status = 'active';
