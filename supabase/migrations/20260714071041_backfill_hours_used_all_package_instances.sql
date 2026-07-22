
update public.package_instances pi
set hours_used = (
  public.fn_package_used_minutes(pi.id)
  + coalesce((
      select sum(public.fn_package_used_minutes(child.id))
      from public.package_instances child
      where child.parent_instance_id = pi.id
    ), 0)
) / 60.0;
