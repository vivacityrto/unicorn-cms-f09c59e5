
-- 1) Consult hours per tenant, 7d vs prev 7d
create or replace view public.v_exec_consult_hours_7d as
with windows as (
  select
    (now() - interval '7 days')  as w0_from,
    now()                        as w0_to,
    (now() - interval '14 days') as w1_from,
    (now() - interval '7 days')  as w1_to
)
select
  cleg.tenant_id,
  coalesce(sum(cl.hours) filter (
    where cl.created_at >= w.w0_from and cl.created_at < w.w0_to
  ), 0) as consult_hours_logged_7d,
  coalesce(sum(cl.hours) filter (
    where cl.created_at >= w.w1_from and cl.created_at < w.w1_to
  ), 0) as consult_hours_logged_prev_7d,
  coalesce(sum(cl.hours) filter (
    where cl.created_at >= w.w0_from and cl.created_at < w.w0_to
  ), 0)
  -
  coalesce(sum(cl.hours) filter (
    where cl.created_at >= w.w1_from and cl.created_at < w.w1_to
  ), 0) as consult_hours_logged_delta
from public.consult_logs cl
join public.clients_legacy cleg on cleg.id = cl.client_id
cross join windows w
group by cleg.tenant_id;

-- 2) Phases completed per tenant, 7d vs prev 7d
-- A phase completion = stage_state_audit_log row where new_status = 'completed'
-- Mapped via client_package_stage_state which has tenant_id directly
create or replace view public.v_exec_phases_completed_7d as
with windows as (
  select
    (now() - interval '7 days')  as w0_from,
    now()                        as w0_to,
    (now() - interval '14 days') as w1_from,
    (now() - interval '7 days')  as w1_to
)
select
  cpss.tenant_id,
  count(*) filter (
    where sal.changed_at >= w.w0_from and sal.changed_at < w.w0_to
  ) as phases_completed_7d,
  count(*) filter (
    where sal.changed_at >= w.w1_from and sal.changed_at < w.w1_to
  ) as phases_completed_prev_7d,
  count(*) filter (
    where sal.changed_at >= w.w0_from and sal.changed_at < w.w0_to
  )
  -
  count(*) filter (
    where sal.changed_at >= w.w1_from and sal.changed_at < w.w1_to
  ) as phases_completed_delta
from public.stage_state_audit_log sal
join public.client_package_stage_state cpss
  on cpss.id = sal.stage_state_id
cross join windows w
where lower(sal.new_status) = 'completed'
group by cpss.tenant_id;

-- 3) Patched momentum view: merge all 5 metric sources
create or replace view public.v_exec_execution_momentum_7d as
with windows as (
  select
    now() as now_ts,
    (now() - interval '7 days') as w0_from,
    now() as w0_to,
    (now() - interval '14 days') as w1_from,
    (now() - interval '7 days') as w1_to
),
risks_resolved as (
  select
    ei.tenant_id,
    count(*) filter (where ei.resolved_at >= w.w0_from and ei.resolved_at < w.w0_to) as w0,
    count(*) filter (where ei.resolved_at >= w.w1_from and ei.resolved_at < w.w1_to) as w1
  from public.eos_issues ei
  cross join windows w
  where ei.resolved_at is not null
  group by ei.tenant_id
),
documents_generated as (
  select
    gd.tenant_id,
    count(*) filter (where gd.created_at >= w.w0_from and gd.created_at < w.w0_to) as w0,
    count(*) filter (where gd.created_at >= w.w1_from and gd.created_at < w.w1_to) as w1
  from public.generated_documents gd
  cross join windows w
  group by gd.tenant_id
),
document_events as (
  select
    dal.tenant_id,
    count(*) filter (where dal.occurred_at >= w.w0_from and dal.occurred_at < w.w0_to) as w0,
    count(*) filter (where dal.occurred_at >= w.w1_from and dal.occurred_at < w.w1_to) as w1
  from public.document_activity_log dal
  cross join windows w
  group by dal.tenant_id
),
tenants_union as (
  select tenant_id from risks_resolved
  union
  select tenant_id from documents_generated
  union
  select tenant_id from document_events
  union
  select tenant_id from v_exec_consult_hours_7d
  union
  select tenant_id from v_exec_phases_completed_7d
)
select
  t.tenant_id,

  coalesce(rr.w0, 0::bigint) as risks_resolved_7d,
  coalesce(rr.w1, 0::bigint) as risks_resolved_prev_7d,
  coalesce(rr.w0, 0::bigint) - coalesce(rr.w1, 0::bigint) as risks_resolved_delta,

  coalesce(dg.w0, 0::bigint) as documents_generated_7d,
  coalesce(dg.w1, 0::bigint) as documents_generated_prev_7d,
  coalesce(dg.w0, 0::bigint) - coalesce(dg.w1, 0::bigint) as documents_generated_delta,

  coalesce(de.w0, 0::bigint) as document_events_7d,
  coalesce(de.w1, 0::bigint) as document_events_prev_7d,
  coalesce(de.w0, 0::bigint) - coalesce(de.w1, 0::bigint) as document_events_delta,

  coalesce(pc.phases_completed_7d, 0::bigint) as phases_completed_7d,
  coalesce(pc.phases_completed_prev_7d, 0::bigint) as phases_completed_prev_7d,
  coalesce(pc.phases_completed_delta, 0::bigint) as phases_completed_delta,

  coalesce(ch.consult_hours_logged_7d, 0::numeric) as consult_hours_logged_7d,
  coalesce(ch.consult_hours_logged_prev_7d, 0::numeric) as consult_hours_logged_prev_7d,
  coalesce(ch.consult_hours_logged_delta, 0::numeric) as consult_hours_logged_delta

from tenants_union t
left join risks_resolved rr on rr.tenant_id = t.tenant_id
left join documents_generated dg on dg.tenant_id = t.tenant_id
left join document_events de on de.tenant_id = t.tenant_id
left join v_exec_phases_completed_7d pc on pc.tenant_id = t.tenant_id
left join v_exec_consult_hours_7d ch on ch.tenant_id = t.tenant_id;
