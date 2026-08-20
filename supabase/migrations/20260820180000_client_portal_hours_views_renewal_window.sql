-- Client portal Packages page ("Where your hours went" breakdown and "Hours
-- over time" chart) was found to still have the lifetime-vs-windowed bug
-- already fixed everywhere else this session (fn_package_used_minutes(),
-- get_client_package_dashboard(), rpc_get_package_usage(),
-- v_package_burndown - see 2026-08-20-package-renewal-period-windowing.md
-- and its follow-ups). v_client_package_hours_by_type and
-- v_client_package_hours_timeline back those two sections
-- (src/hooks/use-client-package-hours-by-type.ts,
-- use-client-package-hours-timeline.ts) and were windowing by
-- `te.start_at >= pi.start_date` (package inception) with no upper bound and
-- no renewal-cycle awareness at all - on a package several renewals into its
-- life, both would sum the client's entire history, not the current cycle.
--
-- Also blind to time_entry_allocations, same second bug class
-- v_package_burndown was fixed for on 2026-07-30: summed raw
-- time_entries.duration_minutes directly, understating/misattributing usage
-- for any RTO+CRICOS dual-scope client whose entries get split across
-- memberships.
--
-- Rewritten to match v_package_burndown's exact windowing + allocation-aware
-- pattern: entries WITH an allocation row credit that allocation's own
-- package_instance_id using allocated_minutes; entries with NO allocation
-- row at all fall back to their own package_instance_id + raw
-- duration_minutes. Window is start_renewal_date -> next_renewal_date
-- (falling back to start_date -> start_date+1yr for any instance missing
-- start_renewal_date, same fallback v_package_burndown uses).
--
-- CREATE OR REPLACE VIEW is safe here - output column list/types unchanged
-- for both views, only the underlying WITH clauses changed. security_invoker
-- explicitly re-specified since these are client-portal-readable views (RLS
-- on time_entries/package_instances/time_entry_allocations does the actual
-- tenant scoping) and must not silently revert to definer semantics.

CREATE OR REPLACE VIEW public.v_client_package_hours_by_type
WITH (security_invoker = true) AS
WITH per_entry AS (
  SELECT
    tea.package_instance_id,
    pi.tenant_id,
    COALESCE(NULLIF(TRIM(te.work_type), ''), 'Other') AS work_type,
    NULLIF(TRIM(te.work_sub_type), '') AS work_sub_type,
    tea.allocated_minutes AS duration_minutes
  FROM public.time_entry_allocations tea
  JOIN public.time_entries te ON te.id = tea.time_entry_id
  JOIN public.package_instances pi ON pi.id = tea.package_instance_id
  WHERE te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
    AND te.is_billable = true
    AND te.work_type <> 'carry_over'
    AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
    AND te.start_at <  COALESCE(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')

  UNION ALL

  SELECT
    te.package_instance_id,
    pi.tenant_id,
    COALESCE(NULLIF(TRIM(te.work_type), ''), 'Other'),
    NULLIF(TRIM(te.work_sub_type), ''),
    te.duration_minutes
  FROM public.time_entries te
  JOIN public.package_instances pi ON pi.id = te.package_instance_id
  WHERE te.package_instance_id IS NOT NULL
    AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
    AND te.is_billable = true
    AND te.work_type <> 'carry_over'
    AND NOT EXISTS (SELECT 1 FROM public.time_entry_allocations tea2 WHERE tea2.time_entry_id = te.id)
    AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
    AND te.start_at <  COALESCE(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')
), totals AS (
  SELECT package_instance_id, sum(duration_minutes)::numeric AS total_minutes
  FROM per_entry
  GROUP BY package_instance_id
), grouped AS (
  SELECT
    pe.package_instance_id,
    pe.tenant_id,
    pe.work_type,
    pe.work_sub_type,
    sum(pe.duration_minutes)::numeric AS minutes,
    sum(pe.duration_minutes)::numeric / 60.0 AS hours
  FROM per_entry pe
  GROUP BY pe.package_instance_id, pe.tenant_id, pe.work_type, pe.work_sub_type
)
SELECT
  g.package_instance_id,
  g.tenant_id,
  g.work_type,
  g.work_sub_type,
  g.minutes,
  round(g.hours, 2) AS hours,
  CASE WHEN t.total_minutes = 0 THEN 0 ELSE round(g.minutes / t.total_minutes, 4) END AS pct_of_total,
  row_number() OVER (PARTITION BY g.package_instance_id ORDER BY g.minutes DESC, g.work_type) AS rank_in_package
FROM grouped g
JOIN totals t ON t.package_instance_id = g.package_instance_id;

CREATE OR REPLACE VIEW public.v_client_package_hours_timeline
WITH (security_invoker = true) AS
WITH per_entry AS (
  SELECT
    tea.package_instance_id,
    pi.tenant_id,
    (te.start_at AT TIME ZONE 'Australia/Sydney')::date AS activity_date,
    tea.allocated_minutes AS minutes
  FROM public.time_entry_allocations tea
  JOIN public.time_entries te ON te.id = tea.time_entry_id
  JOIN public.package_instances pi ON pi.id = tea.package_instance_id
  WHERE te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
    AND te.is_billable = true
    AND te.work_type <> 'carry_over'
    AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
    AND te.start_at <  COALESCE(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')

  UNION ALL

  SELECT
    te.package_instance_id,
    pi.tenant_id,
    (te.start_at AT TIME ZONE 'Australia/Sydney')::date,
    te.duration_minutes
  FROM public.time_entries te
  JOIN public.package_instances pi ON pi.id = te.package_instance_id
  WHERE te.package_instance_id IS NOT NULL
    AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
    AND te.is_billable = true
    AND te.work_type <> 'carry_over'
    AND NOT EXISTS (SELECT 1 FROM public.time_entry_allocations tea2 WHERE tea2.time_entry_id = te.id)
    AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
    AND te.start_at <  COALESCE(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')
), daily AS (
  SELECT package_instance_id, tenant_id, activity_date, sum(minutes)::numeric / 60.0 AS hours_on_day
  FROM per_entry
  GROUP BY package_instance_id, tenant_id, activity_date
)
SELECT
  d.package_instance_id,
  d.tenant_id,
  d.activity_date,
  round(d.hours_on_day, 2) AS hours_on_day,
  round(sum(d.hours_on_day) OVER (
    PARTITION BY d.package_instance_id ORDER BY d.activity_date
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ), 2) AS cumulative_hours_used,
  row_number() OVER (PARTITION BY d.package_instance_id ORDER BY d.activity_date)::integer AS point_rank
FROM daily d
ORDER BY d.package_instance_id, d.activity_date;
