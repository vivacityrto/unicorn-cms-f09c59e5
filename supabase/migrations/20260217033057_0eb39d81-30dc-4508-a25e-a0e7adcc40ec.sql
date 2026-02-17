
-- 1) Deterministic UUID helper
create or replace function public.uuid_from_text(p_text text)
returns uuid
language sql
immutable
set search_path = 'public'
as $$
  select (
    substr(md5(p_text), 1, 8) || '-' ||
    substr(md5(p_text), 9, 4) || '-' ||
    substr(md5(p_text), 13, 4) || '-' ||
    substr(md5(p_text), 17, 4) || '-' ||
    substr(md5(p_text), 21, 12)
  )::uuid;
$$;

-- 2) Overdue compliance escalation inbox source view
create or replace view public.v_dashboard_priority_inbox_overdue_compliance
with (security_invoker = true)
as
with alerts as (
  select
    tm.tenant_id,
    coalesce(tm.overdue_tasks, 0) as overdue_tasks
  from public.v_tenant_compliance_task_metrics tm
  where coalesce(tm.overdue_tasks, 0) >= 5
),
items as (
  select
    public.uuid_from_text('overdue_compliance_escalation:' || a.tenant_id::text) as item_id,
    'overdue_compliance_escalation'::text as item_type,
    'critical'::text as severity,
    a.tenant_id,
    null::uuid as stage_instance_id,
    null::text as standard_clause,
    ('5+ overdue compliance tasks (' || a.overdue_tasks::text || '). Escalate and triage now.')::text as summary,
    null::uuid as owner_user_id,
    now() as created_at
  from alerts a
)
select i.*
from items i
where not exists (
  select 1
  from public.priority_inbox_actions pia
  where pia.item_id = i.item_id::text
    and pia.item_type = i.item_type
    and pia.action_type = 'snooze'
    and pia.until_at is not null
    and pia.until_at > now()
);

-- 3) Rebuild main priority inbox to include the new source
create or replace view public.v_dashboard_priority_inbox
with (security_invoker = true)
as
select id as item_id, 'risk_alert'::text as item_type,
  severity, tenant_id, null::uuid as stage_instance_id,
  null::text as standard_clause, alert_summary as summary,
  null::uuid as owner_user_id, created_at
from public.real_time_risk_alerts
where resolved_flag = false and archived_flag = false

union all

select sub.id as item_id, 'stage_health'::text as item_type,
  case when sub.health_status = 'critical' then 'critical'::text else 'high'::text end as severity,
  sub.tenant_id, null::uuid as stage_instance_id, null::text as standard_clause,
  ('Stage health: ' || sub.health_status)::text as summary,
  null::uuid as owner_user_id, sub.generated_at as created_at
from (
  select distinct on (sh.stage_instance_id) sh.id, sh.tenant_id, sh.stage_instance_id, sh.health_status, sh.generated_at
  from public.stage_health_snapshots sh
  where sh.health_status in ('at_risk', 'critical')
  order by sh.stage_instance_id, sh.generated_at desc
) sub

union all

select eg.id as item_id, 'evidence_gap'::text as item_type,
  'high'::text as severity, eg.tenant_id, null::uuid as stage_instance_id,
  null::text as standard_clause,
  ('Mandatory evidence gaps: ' || coalesce(jsonb_array_length(eg.missing_categories_json), 0))::text as summary,
  null::uuid as owner_user_id, eg.created_at
from public.evidence_gap_checks eg
where eg.status = 'gaps_found'

union all

select bf.id as item_id, 'burn_risk'::text as item_type,
  'critical'::text as severity, bf.tenant_id, null::uuid as stage_instance_id,
  null::text as standard_clause,
  ('Hours exhaustion projected: ' || coalesce(bf.projected_exhaustion_date::text, 'unknown'))::text as summary,
  null::uuid as owner_user_id, bf.generated_at as created_at
from public.tenant_package_burn_forecast bf
where bf.burn_risk_status = 'critical'

union all

select rf.id as item_id, 'retention_risk'::text as item_type,
  case when rf.retention_status = 'high_risk' then 'critical'::text else 'high'::text end as severity,
  rf.tenant_id, null::uuid as stage_instance_id,
  null::text as standard_clause,
  ('Retention risk: ' || rf.retention_status)::text as summary,
  null::uuid as owner_user_id, rf.generated_at as created_at
from public.tenant_retention_forecasts rf
where rf.retention_status in ('vulnerable', 'high_risk')

union all

select rce.id as item_id, 'regulator_change'::text as item_type,
  case when rce.impact_level = 'critical' then 'critical'::text
       when rce.impact_level = 'high' then 'high'::text else 'moderate'::text end as severity,
  null::bigint as tenant_id, null::uuid as stage_instance_id,
  null::text as standard_clause,
  ('Regulator change: ' || left(coalesce(rce.change_summary_md, ''), 80))::text as summary,
  null::uuid as owner_user_id, rce.created_at
from public.regulator_change_events rce
where rce.review_status = 'pending'

union all

select pa.id as item_id, 'playbook_suggested'::text as item_type,
  'moderate'::text as severity, pa.tenant_id, pa.stage_instance_id,
  null::text as standard_clause,
  ('Playbook suggested: ' || coalesce(pa.activation_reason, ''))::text as summary,
  null::uuid as owner_user_id, pa.activated_at as created_at
from public.playbook_activations pa
where pa.activation_status = 'suggested'

union all

-- NEW: Overdue compliance escalation
select
  oc.item_id, oc.item_type, oc.severity, oc.tenant_id,
  oc.stage_instance_id, oc.standard_clause, oc.summary,
  oc.owner_user_id, oc.created_at
from public.v_dashboard_priority_inbox_overdue_compliance oc;
