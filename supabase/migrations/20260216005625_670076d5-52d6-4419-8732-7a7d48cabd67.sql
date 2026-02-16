
-- Drop in correct dependency order
DROP VIEW IF EXISTS public.v_membership_combined_usage;
DROP VIEW IF EXISTS public.v_package_minutes_used;

CREATE VIEW public.v_package_minutes_used
WITH (security_invoker = true)
AS
SELECT
  tea.tenant_id,
  tea.package_instance_id,
  SUM(CASE
    WHEN te.start_at >= date_trunc('month', CURRENT_DATE) THEN tea.allocated_minutes
    ELSE 0
  END) AS minutes_used_month,
  SUM(CASE
    WHEN te.start_at >= date_trunc('year', CURRENT_DATE) THEN tea.allocated_minutes
    ELSE 0
  END) AS minutes_used_ytd,
  SUM(tea.allocated_minutes) AS minutes_used_total,
  MAX(te.start_at) AS last_logged_at
FROM public.time_entry_allocations tea
JOIN public.time_entries te ON te.id = tea.time_entry_id
GROUP BY tea.tenant_id, tea.package_instance_id;

CREATE VIEW public.v_membership_combined_usage
WITH (security_invoker = true)
AS
SELECT
  pi.tenant_id,
  SUM(pi.included_minutes) AS total_included_minutes,
  COALESCE(SUM(u.minutes_used_total), 0) AS total_used_minutes,
  SUM(pi.included_minutes) - COALESCE(SUM(u.minutes_used_total), 0) AS remaining_minutes
FROM public.package_instances pi
LEFT JOIN public.v_package_minutes_used u
  ON u.package_instance_id = pi.id AND u.tenant_id = pi.tenant_id
WHERE pi.is_active = true
  AND pi.billing_type = 'billable'
  AND pi.billing_category IN ('membership_rto', 'membership_cricos')
GROUP BY pi.tenant_id;
