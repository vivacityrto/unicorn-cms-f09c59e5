
drop view if exists public.v_package_time_summary;

create view public.v_package_time_summary as
select
  te.tenant_id,
  te.package_instance_id,
  sum(te.duration_minutes) filter (where date_trunc('month', te.start_at) = date_trunc('month', now())) as minutes_month,
  sum(te.duration_minutes) as minutes_ytd,
  sum(te.duration_minutes) as minutes_total,
  max(te.start_at) as last_entry_at
from public.time_entries te
join public.package_instances pi on pi.id = te.package_instance_id
where te.package_instance_id is not null
  and te.work_type <> 'carry_over'
  and te.start_at >= (coalesce(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year') - interval '1 year')
  and te.start_at <  coalesce(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')
  and te.is_billable = true
group by te.tenant_id, te.package_instance_id;
