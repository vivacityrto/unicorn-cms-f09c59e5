-- fn_package_used_minutes() had no date floor: it summed every
-- time_entry_allocations / time_entries row ever pointed at a package
-- instance, with no regard for when that work was actually done relative
-- to the instance's own start_date.
--
-- allocate_time_entry() / get_active_membership_packages() always resolve
-- to "whichever RTO/CRICOS package instance is active right now" (no
-- date-awareness at all) — fine for a brand-new time entry, but a one-time
-- bulk reallocation event clustered entirely within 2026-02-23 20:11 to
-- 2026-02-24 09:19 (confirmed via time_entry_allocations.created_at, no
-- similar clustering anywhere else in the table) re-ran that logic against
-- historical time entries spanning back to 2022, permanently re-pointing
-- work done during prior, already-completed package terms onto whichever
-- instance was active that day. Every subsequent renewal has been
-- inheriting that mis-filed history ever since, because nothing here
-- re-scopes a lifetime total to the current term.
--
-- Verified live: SHCS Academy's M-SAR/M-SAC memberships (started
-- 2025-11-18) showed ~47.7h "used" against a 56-63h allowance; ~38.3h of
-- that was work logged as far back as 2024-08-29, over a year before the
-- instance existed. 21 of 1047 package_instances are affected in total,
-- all corrected downward by this fix, none negative.
--
-- Fix: only count time_entries dated on/after the package instance's own
-- start_date. Deliberately does not touch the underlying
-- time_entry_allocations rows (other reporting may depend on them) or
-- change allocate_time_entry()'s "currently active" resolution (out of
-- scope here) - this only changes what counts toward a given instance's
-- own used-hours figure. Matches how v_package_burndown already scopes its
-- current-term window (see 20260730020000).

CREATE OR REPLACE FUNCTION public.fn_package_used_minutes(p_package_instance_id bigint)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  select
    coalesce((
      select sum(tea.allocated_minutes)
      from public.time_entry_allocations tea
      join public.time_entries te on te.id = tea.time_entry_id
      join public.package_instances pi on pi.id = tea.package_instance_id
      where tea.package_instance_id = p_package_instance_id
        and te.is_billable = true
        and te.work_type <> 'carry_over'
        and te.start_at >= pi.start_date
    ), 0)
    +
    coalesce((
      select sum(te.duration_minutes)
      from public.time_entries te
      join public.package_instances pi on pi.id = te.package_instance_id
      where te.package_instance_id = p_package_instance_id
        and te.is_billable = true
        and te.work_type <> 'carry_over'
        and te.start_at >= pi.start_date
        and not exists (
          select 1 from public.time_entry_allocations tea2
          where tea2.time_entry_id = te.id
        )
    ), 0);
$function$;

COMMENT ON FUNCTION public.fn_package_used_minutes(bigint) IS
  'Canonical used-minutes calc for a package_instance. Only counts time_entries dated on/after the instance''s own start_date - excludes historical time re-pointed here by a one-time 2026-02-24 bulk reallocation event that predates this fix. Do not compute hours_used any other way (e.g. never join time_entries.package_id against package_instances.id - package_id has no FK and is not the same value space).';

-- One-time refresh: existing package_instances.hours_used values were
-- computed with the old (unfloored) function and won't pick up this fix on
-- their own until their next unrelated time_entries change. Recompute all
-- of them now, using the exact same formula tg_recalc_package_hours_used()
-- applies on every future write, so nothing is left stale.
UPDATE public.package_instances pi
SET hours_used = (
  public.fn_package_used_minutes(pi.id)
  + COALESCE((
      SELECT SUM(public.fn_package_used_minutes(child.id))
      FROM public.package_instances child
      WHERE child.parent_instance_id = pi.id
    ), 0)
) / 60.0;
