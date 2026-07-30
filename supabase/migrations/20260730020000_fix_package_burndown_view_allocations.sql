-- Fix v_package_burndown: it never accounted for time_entry_allocations,
-- so any time entry that was split/reallocated across packages (via the
-- time_entry_allocations table) was invisible to this view. It only summed
-- raw time_entries.duration_minutes grouped by the (confusingly named)
-- time_entries.package_id column, which in practice stores the same value
-- as package_instance_id, but never looked at allocations at all.
--
-- This produced burndown figures on the Client Detail > Time tab that
-- silently understated usage — verified live on tenant 7408 (SHCS Academy):
-- Sapphire CRICOS Membership showed 0:00/63:00 used while the authoritative
-- fn_package_used_minutes() (the same function package_instances.hours_used
-- is kept in sync with via trg_recalc_package_hours_used) reported 47.75h.
-- 28 of 91 active package instances were affected, understated by 978
-- minutes (~16.3h) on average.
--
-- The fix mirrors fn_package_used_minutes()'s pattern: sum allocated_minutes
-- from time_entry_allocations for entries that were reallocated, falling
-- back to the raw time_entries.duration_minutes for entries with no
-- allocation row, both filtered to is_billable = true and
-- work_type <> 'carry_over' for consistency with that function. The
-- existing renewal-year windowing (this view's whole reason for being
-- distinct from the lifetime hours_used figure) is preserved unchanged.

CREATE OR REPLACE VIEW public.v_package_burndown AS
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 AS included_minutes,
  COALESCE(ts.used_minutes, 0) AS used_minutes,
  COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 - COALESCE(ts.used_minutes, 0) AS remaining_minutes,
  CASE
    WHEN (COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60) = 0 THEN 0::numeric
    ELSE round(COALESCE(ts.used_minutes, 0)::numeric / (COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60)::numeric * 100, 1)
  END AS percent_used
FROM public.package_instances pi
LEFT JOIN LATERAL (
  SELECT (
    COALESCE((
      SELECT SUM(tea.allocated_minutes)
      FROM public.time_entry_allocations tea
      JOIN public.time_entries te ON te.id = tea.time_entry_id
      WHERE tea.package_instance_id = pi.id
        AND te.is_billable = true
        AND te.work_type <> 'carry_over'
        AND te.start_at >= (COALESCE(pi.next_renewal_date::timestamp without time zone, pi.start_date + interval '1 year') - interval '1 year')
        AND te.start_at < COALESCE(pi.next_renewal_date::timestamp without time zone, pi.start_date + interval '1 year')
    ), 0)
    +
    COALESCE((
      SELECT SUM(te.duration_minutes)
      FROM public.time_entries te
      WHERE te.package_instance_id = pi.id
        AND te.is_billable = true
        AND te.work_type <> 'carry_over'
        AND NOT EXISTS (SELECT 1 FROM public.time_entry_allocations tea2 WHERE tea2.time_entry_id = te.id)
        AND te.start_at >= (COALESCE(pi.next_renewal_date::timestamp without time zone, pi.start_date + interval '1 year') - interval '1 year')
        AND te.start_at < COALESCE(pi.next_renewal_date::timestamp without time zone, pi.start_date + interval '1 year')
    ), 0)
  ) AS used_minutes
) ts ON true
WHERE pi.is_complete = false;
