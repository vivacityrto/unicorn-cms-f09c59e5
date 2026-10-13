-- Client portal Packages page: "Where your hours went", "Hours over time" and
-- "Recent work" were empty / wrong for REAL client users while looking correct
-- in staff "View as client".
--
-- Root cause: v_client_package_hours_by_type / _timeline / _recent are
-- security_invoker views that read public.time_entries, and time_entries_select
-- only admits the entry's author, Super Admins and Vivacity team
-- (user_id = auth.uid() OR is_super_admin_safe OR is_vivacity_team_safe). A
-- client user matches none of those, so every view returned zero rows for them,
-- while Vivacity staff impersonating a client bypassed it and saw everything.
-- The package tiles (get_client_package_dashboard) were unaffected because that
-- RPC is SECURITY DEFINER, which is why the tiles showed hours the panels could
-- not explain.
--
-- Fix: same pattern as get_client_package_dashboard / get_package_burndown
-- (20260911210000): tenant-gated SECURITY DEFINER RPCs, row_security off, with
-- app.user_can_access_tenant() as the real gate. Widening the time_entries RLS
-- policy instead would expose every column (including user_id and internal
-- fields) to clients for every consumer of that table; the RPCs return
-- client-facing columns only.
--
-- Windowing/allocation logic is copied verbatim from the views as redefined in
-- 20260820180000 (current renewal cycle, allocation-aware) so the three panels
-- and the package tiles agree. The recent-work RPC now returns EVERY entry in
-- the current cycle (not just the latest 10) and uses the same credited
-- minutes as the totals, so the list adds up to the "Where your hours went"
-- figure. Non-billable entries stay in the list (shown as "Included") but are
-- excluded from the billable totals exactly as before; carry_over is excluded
-- everywhere.

-- 1. Hours by work type ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_client_package_hours_by_type(
  p_tenant_id bigint,
  p_package_instance_id bigint
)
RETURNS TABLE(
  package_instance_id bigint,
  tenant_id bigint,
  work_type text,
  work_sub_type text,
  minutes numeric,
  hours numeric,
  pct_of_total numeric,
  rank_in_package bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $function$
  WITH per_entry AS (
    SELECT
      tea.package_instance_id,
      pi.tenant_id::bigint AS tenant_id,
      COALESCE(NULLIF(TRIM(te.work_type), ''), 'Other') AS work_type,
      NULLIF(TRIM(te.work_sub_type), '') AS work_sub_type,
      tea.allocated_minutes AS duration_minutes
    FROM public.time_entry_allocations tea
    JOIN public.time_entries te ON te.id = tea.time_entry_id
    JOIN public.package_instances pi ON pi.id = tea.package_instance_id
    WHERE pi.id = p_package_instance_id
      AND pi.tenant_id = p_tenant_id
      AND app.user_can_access_tenant(p_tenant_id)
      AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
      AND te.is_billable = true
      AND te.work_type <> 'carry_over'
      AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
      AND te.start_at <  COALESCE(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')

    UNION ALL

    SELECT
      te.package_instance_id,
      pi.tenant_id::bigint,
      COALESCE(NULLIF(TRIM(te.work_type), ''), 'Other'),
      NULLIF(TRIM(te.work_sub_type), ''),
      te.duration_minutes
    FROM public.time_entries te
    JOIN public.package_instances pi ON pi.id = te.package_instance_id
    WHERE pi.id = p_package_instance_id
      AND pi.tenant_id = p_tenant_id
      AND app.user_can_access_tenant(p_tenant_id)
      AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
      AND te.is_billable = true
      AND te.work_type <> 'carry_over'
      AND NOT EXISTS (SELECT 1 FROM public.time_entry_allocations tea2 WHERE tea2.time_entry_id = te.id)
      AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
      AND te.start_at <  COALESCE(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')
  ), totals AS (
    SELECT sum(duration_minutes)::numeric AS total_minutes
    FROM per_entry
  ), grouped AS (
    SELECT
      pe.package_instance_id,
      pe.tenant_id,
      pe.work_type,
      pe.work_sub_type,
      sum(pe.duration_minutes)::numeric AS minutes
    FROM per_entry pe
    GROUP BY pe.package_instance_id, pe.tenant_id, pe.work_type, pe.work_sub_type
  )
  SELECT
    g.package_instance_id,
    g.tenant_id,
    g.work_type,
    g.work_sub_type,
    g.minutes,
    round(g.minutes / 60.0, 2) AS hours,
    CASE WHEN t.total_minutes = 0 THEN 0::numeric ELSE round(g.minutes / t.total_minutes, 4) END AS pct_of_total,
    row_number() OVER (ORDER BY g.minutes DESC, g.work_type) AS rank_in_package
  FROM grouped g
  CROSS JOIN totals t
  ORDER BY rank_in_package;
$function$;

-- 2. Cumulative hours over time ---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_client_package_hours_timeline(
  p_tenant_id bigint,
  p_package_instance_id bigint
)
RETURNS TABLE(
  package_instance_id bigint,
  tenant_id bigint,
  activity_date date,
  hours_on_day numeric,
  cumulative_hours_used numeric,
  point_rank integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $function$
  WITH per_entry AS (
    SELECT
      tea.package_instance_id,
      pi.tenant_id::bigint AS tenant_id,
      (te.start_at AT TIME ZONE 'Australia/Sydney')::date AS activity_date,
      tea.allocated_minutes AS minutes
    FROM public.time_entry_allocations tea
    JOIN public.time_entries te ON te.id = tea.time_entry_id
    JOIN public.package_instances pi ON pi.id = tea.package_instance_id
    WHERE pi.id = p_package_instance_id
      AND pi.tenant_id = p_tenant_id
      AND app.user_can_access_tenant(p_tenant_id)
      AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
      AND te.is_billable = true
      AND te.work_type <> 'carry_over'
      AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
      AND te.start_at <  COALESCE(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')

    UNION ALL

    SELECT
      te.package_instance_id,
      pi.tenant_id::bigint,
      (te.start_at AT TIME ZONE 'Australia/Sydney')::date,
      te.duration_minutes
    FROM public.time_entries te
    JOIN public.package_instances pi ON pi.id = te.package_instance_id
    WHERE pi.id = p_package_instance_id
      AND pi.tenant_id = p_tenant_id
      AND app.user_can_access_tenant(p_tenant_id)
      AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
      AND te.is_billable = true
      AND te.work_type <> 'carry_over'
      AND NOT EXISTS (SELECT 1 FROM public.time_entry_allocations tea2 WHERE tea2.time_entry_id = te.id)
      AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
      AND te.start_at <  COALESCE(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')
  ), daily AS (
    SELECT pe.package_instance_id, pe.tenant_id, pe.activity_date, sum(pe.minutes)::numeric / 60.0 AS hours_on_day
    FROM per_entry pe
    GROUP BY pe.package_instance_id, pe.tenant_id, pe.activity_date
  )
  SELECT
    d.package_instance_id,
    d.tenant_id,
    d.activity_date,
    round(d.hours_on_day, 2) AS hours_on_day,
    round(sum(d.hours_on_day) OVER (
      ORDER BY d.activity_date
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ), 2) AS cumulative_hours_used,
    (row_number() OVER (ORDER BY d.activity_date))::integer AS point_rank
  FROM daily d
  ORDER BY d.activity_date;
$function$;

-- 3. Time log entries that make up the package -------------------------------
-- Every entry in the current renewal cycle, newest first. Entries split across
-- memberships show only the minutes credited to THIS package (matching the
-- totals above); unallocated entries show their full duration. No user_id or
-- other internal columns are returned.
CREATE OR REPLACE FUNCTION public.get_client_package_hours_recent(
  p_tenant_id bigint,
  p_package_instance_id bigint
)
RETURNS TABLE(
  entry_id uuid,
  package_instance_id bigint,
  tenant_id bigint,
  occurred_at timestamptz,
  duration_minutes integer,
  hours numeric,
  work_type text,
  work_sub_type text,
  notes text,
  rank_in_package bigint,
  is_billable boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $function$
  WITH entries AS (
    SELECT
      te.id AS entry_id,
      tea.package_instance_id,
      pi.tenant_id::bigint AS tenant_id,
      te.start_at AS occurred_at,
      tea.allocated_minutes AS duration_minutes,
      te.work_type,
      te.work_sub_type,
      te.notes,
      te.is_billable
    FROM public.time_entry_allocations tea
    JOIN public.time_entries te ON te.id = tea.time_entry_id
    JOIN public.package_instances pi ON pi.id = tea.package_instance_id
    WHERE pi.id = p_package_instance_id
      AND pi.tenant_id = p_tenant_id
      AND app.user_can_access_tenant(p_tenant_id)
      AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
      AND te.work_type <> 'carry_over'
      AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
      AND te.start_at <  COALESCE(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')

    UNION ALL

    SELECT
      te.id,
      te.package_instance_id,
      pi.tenant_id::bigint,
      te.start_at,
      te.duration_minutes,
      te.work_type,
      te.work_sub_type,
      te.notes,
      te.is_billable
    FROM public.time_entries te
    JOIN public.package_instances pi ON pi.id = te.package_instance_id
    WHERE pi.id = p_package_instance_id
      AND pi.tenant_id = p_tenant_id
      AND app.user_can_access_tenant(p_tenant_id)
      AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
      AND te.work_type <> 'carry_over'
      AND NOT EXISTS (SELECT 1 FROM public.time_entry_allocations tea2 WHERE tea2.time_entry_id = te.id)
      AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
      AND te.start_at <  COALESCE(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')
  )
  SELECT
    e.entry_id,
    e.package_instance_id,
    e.tenant_id,
    e.occurred_at,
    e.duration_minutes,
    round(e.duration_minutes::numeric / 60.0, 2) AS hours,
    COALESCE(NULLIF(TRIM(e.work_type), ''), 'Other') AS work_type,
    NULLIF(TRIM(e.work_sub_type), '') AS work_sub_type,
    NULLIF(TRIM(e.notes), '') AS notes,
    row_number() OVER (ORDER BY e.occurred_at DESC NULLS LAST, e.entry_id DESC) AS rank_in_package,
    e.is_billable
  FROM entries e
  ORDER BY rank_in_package;
$function$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default -- revoke before granting
-- narrowly, otherwise anon inherits access through PUBLIC.
REVOKE EXECUTE ON FUNCTION public.get_client_package_hours_by_type(bigint, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_client_package_hours_timeline(bigint, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_client_package_hours_recent(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_package_hours_by_type(bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_package_hours_timeline(bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_package_hours_recent(bigint, bigint) TO authenticated;

-- The old views were granted full table privileges to anon + authenticated and
-- their only consumers (three hooks in src/hooks) move to the RPCs in the same
-- PR (no other .from() callers; verified by grep). Revoke direct access, same
-- as v_client_package_dashboard / v_package_burndown in 20260911210000.
REVOKE ALL ON public.v_client_package_hours_by_type FROM anon, authenticated;
REVOKE ALL ON public.v_client_package_hours_timeline FROM anon, authenticated;
REVOKE ALL ON public.v_client_package_hours_recent FROM anon, authenticated;
