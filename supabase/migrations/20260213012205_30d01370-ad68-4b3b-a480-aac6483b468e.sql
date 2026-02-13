
-- Alignment Signals view (7d)
create or replace view public.v_exec_alignment_signals_7d as
with
params as (
  select (now() - interval '7 days') as from_ts
),
anomalies as (
  select
    a.tenant_id,
    a.package_instance_id,
    'anomaly'::text as signal_type,
    coalesce(a.severity, 'warning')::text as severity,
    a.anomaly_type::text as title,
    coalesce(a.delta_value::text, '') as delta_text,
    coalesce(a.window_days, 0) as window_days,
    a.detected_at::timestamptz as happened_at,
    null::uuid as owner_user_id
  from public.v_executive_anomalies_30d a
  where a.detected_at >= (select from_ts from params)::date
),
watchlist as (
  select
    w.tenant_id,
    w.package_instance_id,
    'watchlist'::text as signal_type,
    'warning'::text as severity,
    w.change_type::text as title,
    coalesce(w.change_value::text, '') as delta_text,
    7 as window_days,
    now() as happened_at,
    null::uuid as owner_user_id
  from public.v_executive_watchlist_7d w
),
critical_risks as (
  select
    ei.tenant_id,
    null::bigint as package_instance_id,
    'risk_created'::text as signal_type,
    'critical'::text as severity,
    ('Critical risk: ' || coalesce(ei.title, 'Untitled'))::text as title,
    null::text as delta_text,
    7 as window_days,
    ei.created_at as happened_at,
    ei.assigned_to as owner_user_id
  from public.eos_issues ei
  where ei.created_at >= (select from_ts from params)
    and lower(coalesce(ei.impact, '')) = 'critical'
),
stalled_packages as (
  select
    cp.tenant_id,
    cp.package_id as package_instance_id,
    'stall'::text as signal_type,
    'warning'::text as severity,
    'Package stalled > 14 days'::text as title,
    null::text as delta_text,
    14 as window_days,
    cp.created_at as happened_at,
    cp.assigned_csc_user_id as owner_user_id
  from public.client_packages cp
  where cp.end_date < current_date
    and coalesce(cp.status, '') not in ('archived', 'completed')
),
unioned as (
  select * from anomalies
  union all
  select * from watchlist
  union all
  select * from critical_risks
  union all
  select * from stalled_packages
)
select * from unioned
where tenant_id is not null;

-- Execution Momentum view (7d vs prev 7d)
create or replace view public.v_exec_execution_momentum_7d as
with
windows as (
  select
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
)
select
  t.tenant_id,
  coalesce(rr.w0, 0) as risks_resolved_7d,
  coalesce(rr.w1, 0) as risks_resolved_prev_7d,
  (coalesce(rr.w0, 0) - coalesce(rr.w1, 0)) as risks_resolved_delta,
  coalesce(dg.w0, 0) as documents_generated_7d,
  coalesce(dg.w1, 0) as documents_generated_prev_7d,
  (coalesce(dg.w0, 0) - coalesce(dg.w1, 0)) as documents_generated_delta,
  coalesce(de.w0, 0) as document_events_7d,
  coalesce(de.w1, 0) as document_events_prev_7d,
  (coalesce(de.w0, 0) - coalesce(de.w1, 0)) as document_events_delta
from tenants_union t
left join risks_resolved rr on rr.tenant_id = t.tenant_id
left join documents_generated dg on dg.tenant_id = t.tenant_id
left join document_events de on de.tenant_id = t.tenant_id;
