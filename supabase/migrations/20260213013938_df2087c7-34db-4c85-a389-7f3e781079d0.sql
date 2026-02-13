
-- 1A) Dedupe consult hours: distinct on consult_id, join via clients_legacy for tenant_id
create or replace view public.v_exec_consult_hours_7d as
with windows as (
  select
    (now() - interval '7 days')  as w0_from,
    now()                        as w0_to,
    (now() - interval '14 days') as w1_from,
    (now() - interval '7 days')  as w1_to
),
base as (
  select distinct
    cl.consult_id,
    cl.client_id,
    cl.created_at,
    cl.hours
  from public.consult_logs cl
)
select
  cleg.tenant_id,
  coalesce(sum(b.hours) filter (where b.created_at >= w.w0_from and b.created_at < w.w0_to), 0) as consult_hours_logged_7d,
  coalesce(sum(b.hours) filter (where b.created_at >= w.w1_from and b.created_at < w.w1_to), 0) as consult_hours_logged_prev_7d,
  coalesce(sum(b.hours) filter (where b.created_at >= w.w0_from and b.created_at < w.w0_to), 0)
  -
  coalesce(sum(b.hours) filter (where b.created_at >= w.w1_from and b.created_at < w.w1_to), 0) as consult_hours_logged_delta
from base b
join public.clients_legacy cleg on cleg.id = b.client_id
cross join windows w
group by cleg.tenant_id;

-- 1B) Dedupe phases completed: distinct on audit row id, join via client_package_stage_state.tenant_id
create or replace view public.v_exec_phases_completed_7d as
with windows as (
  select
    (now() - interval '7 days')  as w0_from,
    now()                        as w0_to,
    (now() - interval '14 days') as w1_from,
    (now() - interval '7 days')  as w1_to
),
completed as (
  select distinct
    sal.id,
    sal.stage_state_id,
    sal.changed_at
  from public.stage_state_audit_log sal
  where lower(sal.new_status) = 'completed'
)
select
  cpss.tenant_id,
  count(*) filter (where c.changed_at >= w.w0_from and c.changed_at < w.w0_to) as phases_completed_7d,
  count(*) filter (where c.changed_at >= w.w1_from and c.changed_at < w.w1_to) as phases_completed_prev_7d,
  count(*) filter (where c.changed_at >= w.w0_from and c.changed_at < w.w0_to)
  -
  count(*) filter (where c.changed_at >= w.w1_from and c.changed_at < w.w1_to) as phases_completed_delta
from completed c
join public.client_package_stage_state cpss
  on cpss.id = c.stage_state_id
cross join windows w
group by cpss.tenant_id;

-- 2) System health: coverage + freshness per tenant
create or replace view public.v_exec_system_health as
select
  cpss_tenants.tenant_id,
  count(distinct cpss_tenants.tenant_id) as active_clients,
  count(distinct cs_match.tenant_id) as clients_with_compliance_snapshot,
  round(
    100.0 * count(distinct cs_match.tenant_id)::numeric / nullif(count(distinct cpss_tenants.tenant_id), 0),
    1
  ) as compliance_coverage_pct,
  max(cs_match.calculated_at) as latest_compliance_snapshot_at
from (
  select distinct tenant_id from public.client_package_stage_state
) cpss_tenants
left join public.v_compliance_score_latest cs_match
  on cs_match.tenant_id = cpss_tenants.tenant_id
group by cpss_tenants.tenant_id;
