
-- v2: also correct package_id to match (it was holding a packages.id template value on these
-- 4 legacy rows, not a package_instances.id, which trips the fn_validate_time_entry_package
-- trigger that treats package_id as if it were always an instance id).
with candidate as (
  select
    te.id as time_entry_id,
    (
      select pi.id
      from public.package_instances pi
      where pi.tenant_id = te.tenant_id
        and pi.package_id = te.package_id
      order by pi.is_active desc, pi.start_date desc nulls last
      limit 1
    ) as resolved_instance_id
  from public.time_entries te
  where te.package_instance_id is null
)
update public.time_entries te
set package_instance_id = c.resolved_instance_id,
    package_id = c.resolved_instance_id
from candidate c
where te.id = c.time_entry_id
  and c.resolved_instance_id is not null;
