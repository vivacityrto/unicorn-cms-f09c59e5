
create or replace function public.fn_package_used_minutes(p_package_instance_id bigint)
returns numeric
language sql
stable
security definer
set search_path to ''
as $$
  select
    coalesce((
      select sum(tea.allocated_minutes)
      from public.time_entry_allocations tea
      join public.time_entries te on te.id = tea.time_entry_id
      where tea.package_instance_id = p_package_instance_id
        and te.is_billable = true
        and te.work_type <> 'carry_over'
    ), 0)
    +
    coalesce((
      select sum(te.duration_minutes)
      from public.time_entries te
      where te.package_instance_id = p_package_instance_id
        and te.is_billable = true
        and te.work_type <> 'carry_over'
        and not exists (
          select 1 from public.time_entry_allocations tea2
          where tea2.time_entry_id = te.id
        )
    ), 0);
$$;

comment on function public.fn_package_used_minutes(bigint) is
  'Canonical used-minutes calc for a package_instance. Excludes work_type=carry_over entries (accounting adjustments, not logged consultation time - flagged to Angela to decide whether these should instead credit hours_added). Never join time_entries.package_id against package_instances.id - package_id has no FK and is not the same value space.';

-- Recompute stored totals now that carry_over is excluded
update public.package_instances pi
set hours_used = (
  public.fn_package_used_minutes(pi.id)
  + coalesce((
      select sum(public.fn_package_used_minutes(child.id))
      from public.package_instances child
      where child.parent_instance_id = pi.id
    ), 0)
) / 60.0;
