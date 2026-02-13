
-- Drop old version if it exists
drop view if exists public.v_exec_alignment_signals_7d;

-- Unified Alignment Signals view
create or replace view public.v_exec_alignment_signals_7d as
with
params as (
  select
    (now() - interval '7 days') as from_7d,
    now() as to_now
),

-- A. Critical Risk Created
critical_risks as (
  select
    'critical_risk_created' as signal_type,
    'critical'::text as severity,
    'New critical risk created' as title,
    coalesce(ei.title, ei.description, '') as detail,
    ei.tenant_id,
    null::bigint as package_instance_id,
    ei.assigned_to as owner_user_uuid,
    ei.created_at as happened_at,
    'critical_risk:' || ei.id::text as source_key,
    1 as priority_rank,
    'Discuss risk response and owner.' as suggested_discussion
  from public.eos_issues ei, params p
  where lower(coalesce(ei.impact, '')) = 'critical'
    and ei.created_at >= p.from_7d
    and ei.deleted_at is null
),

-- B. Stalled Packages (no stage activity in 14+ days)
stalled_packages as (
  select
    'stalled' as signal_type,
    'warning'::text as severity,
    'Stalled > 14 days' as title,
    'Last activity: ' || to_char(max_updated, 'DD Mon YYYY') as detail,
    sp.tenant_id,
    null::bigint as package_instance_id,
    sp.assigned_csc_user_id as owner_user_uuid,
    sp.max_updated as happened_at,
    'stalled:' || sp.package_id::text as source_key,
    2 as priority_rank,
    'Discuss unblock plan and next action.' as suggested_discussion
  from (
    select
      cp.id as package_id,
      cp.tenant_id,
      cp.assigned_csc_user_id,
      max(cpss.updated_at) as max_updated
    from public.client_packages cp
    join public.client_package_stage_state cpss on cpss.package_id = cp.package_id and cpss.tenant_id = cp.tenant_id
    where coalesce(cp.status, '') not in ('archived', 'completed')
    group by cp.id, cp.tenant_id, cp.assigned_csc_user_id
    having max(cpss.updated_at) <= (now() - interval '14 days')
  ) sp
),

-- C. Phase Completed
phase_completed as (
  select
    'phase_completed' as signal_type,
    'info'::text as severity,
    'Phase completed' as title,
    '' as detail,
    cpss.tenant_id,
    null::bigint as package_instance_id,
    sal.changed_by as owner_user_uuid,
    sal.changed_at as happened_at,
    'phase:' || sal.id::text as source_key,
    5 as priority_rank,
    'Confirm next phase and timing.' as suggested_discussion
  from public.stage_state_audit_log sal
  join public.client_package_stage_state cpss on cpss.id = sal.stage_state_id
  cross join params p
  where lower(sal.new_status) = 'completed'
    and sal.changed_at >= p.from_7d
),

-- D. Consult Spike (≥8h per client in 7 days)
consult_spike as (
  select
    'consult_spike' as signal_type,
    'info'::text as severity,
    'High consult hours this week' as title,
    round(sum(cl.hours)::numeric, 1)::text || 'h total' as detail,
    cleg.tenant_id,
    null::bigint as package_instance_id,
    null::uuid as owner_user_uuid,
    max(cl.created_at) as happened_at,
    'consult_spike:' || cleg.tenant_id::text as source_key,
    4 as priority_rank,
    'Discuss resourcing and scope pressure.' as suggested_discussion
  from public.consult_logs cl
  join public.clients_legacy cleg on cleg.id = cl.client_id
  cross join params p
  where cl.created_at >= p.from_7d
  group by cleg.tenant_id
  having sum(cl.hours) >= 8
),

-- E. Anomalies
anomaly_signals as (
  select
    'anomaly' as signal_type,
    coalesce(a.severity, 'warning')::text as severity,
    a.anomaly_type as title,
    'Delta: ' || coalesce(a.delta_value::text, '0') as detail,
    a.tenant_id,
    a.package_instance_id,
    null::uuid as owner_user_uuid,
    a.detected_at::timestamptz as happened_at,
    'anomaly:' || a.tenant_id::text || ':' || coalesce(a.package_instance_id::text, '0') || ':' || a.anomaly_type as source_key,
    3 as priority_rank,
    'Discuss cause and corrective action.' as suggested_discussion
  from public.v_executive_anomalies_30d a, params p
  where a.detected_at >= p.from_7d::date
),

-- F. Watchlist
watchlist_signals as (
  select
    'watchlist' as signal_type,
    'warning'::text as severity,
    w.change_type as title,
    'Value: ' || coalesce(w.change_value::text, '') as detail,
    w.tenant_id,
    w.package_instance_id,
    null::uuid as owner_user_uuid,
    now() as happened_at,
    'watchlist:' || w.tenant_id::text || ':' || coalesce(w.package_instance_id::text, '0') || ':' || w.change_type as source_key,
    3 as priority_rank,
    'Discuss movement and next step.' as suggested_discussion
  from public.v_executive_watchlist_7d w
),

-- Union all signals
all_signals as (
  select * from critical_risks
  union all select * from stalled_packages
  union all select * from phase_completed
  union all select * from consult_spike
  union all select * from anomaly_signals
  union all select * from watchlist_signals
),

-- Deduplicate: keep most recent per source_key
deduped as (
  select distinct on (source_key) *
  from all_signals
  order by source_key, happened_at desc
),

-- Owner fallback: if null, try client_packages.assigned_csc_user_id for same tenant
with_owner as (
  select
    d.*,
    coalesce(d.owner_user_uuid, fallback_owner.assigned_csc_user_id) as resolved_owner_uuid
  from deduped d
  left join lateral (
    select cp2.assigned_csc_user_id
    from public.client_packages cp2
    where cp2.tenant_id = d.tenant_id
      and cp2.assigned_csc_user_id is not null
      and coalesce(cp2.status, '') not in ('archived', 'completed')
    order by cp2.created_at desc
    limit 1
  ) fallback_owner on d.owner_user_uuid is null
)

select
  wo.signal_type,
  wo.severity,
  wo.title,
  wo.detail,
  wo.tenant_id,
  wo.package_instance_id,
  wo.resolved_owner_uuid as owner_user_uuid,
  u.first_name || ' ' || u.last_name as owner_name,
  t.name as client_name,
  wo.happened_at,
  wo.source_key,
  wo.priority_rank,
  wo.suggested_discussion,
  '/clients/' || wo.tenant_id::text as deep_link_href
from with_owner wo
left join public.users u on u.user_uuid = wo.resolved_owner_uuid
left join public.tenants t on t.id = wo.tenant_id
order by wo.priority_rank asc, wo.happened_at desc;
