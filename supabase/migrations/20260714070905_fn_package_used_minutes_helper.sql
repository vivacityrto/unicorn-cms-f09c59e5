
-- Canonical, single-source-of-truth calculation for "billable minutes used" against a package instance.
-- Combines:
--   1) time_entry_allocations (the RTO/CRICOS split-allocation system) for entries that went through it
--   2) time_entries.package_instance_id directly, for entries that never got an allocation row
--      (non-membership packages, and carry-over adjustment entries which are deliberately skipped
--       by the auto-allocator)
-- NOT EXISTS guard prevents double-counting an entry that has both.
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
    ), 0)
    +
    coalesce((
      select sum(te.duration_minutes)
      from public.time_entries te
      where te.package_instance_id = p_package_instance_id
        and te.is_billable = true
        and not exists (
          select 1 from public.time_entry_allocations tea2
          where tea2.time_entry_id = te.id
        )
    ), 0);
$$;

comment on function public.fn_package_used_minutes(bigint) is
  'Canonical used-minutes calc for a package_instance. Do not compute hours_used any other way (e.g. never join time_entries.package_id against package_instances.id - package_id has no FK and is not the same value space).';
