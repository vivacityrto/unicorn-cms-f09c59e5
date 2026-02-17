
-- Phase 2: Expand package tasks to tenants via package_instances
create or replace view public.v_tenant_required_tasks
with (security_invoker = true)
as
with package_scope as (
  select
    pi.tenant_id,
    tr.id as task_requirement_id,
    tr.due_days_after_start,
    pi.start_date
  from public.task_requirements tr
  join public.package_instances pi
    on pi.package_id = tr.package_id
   and pi.is_active = true
   and coalesce(pi.is_complete, false) = false
  where tr.scope_type = 'package'
),
tenant_scope as (
  select
    tr.tenant_id,
    tr.id as task_requirement_id,
    tr.due_days_after_start,
    null::date as start_date
  from public.task_requirements tr
  where tr.scope_type = 'tenant'
)
select
  s.tenant_id,
  s.task_requirement_id,
  case
    when s.due_days_after_start is null then null
    when s.start_date is null then null
    else s.start_date + (s.due_days_after_start || ' days')::interval
  end as calculated_due_at
from (
  select * from package_scope
  union all
  select * from tenant_scope
) s;
