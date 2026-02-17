
-- Phase 1: Task Metrics View
create or replace view public.v_tenant_compliance_task_metrics
with (security_invoker = true)
as
select
  t.id as tenant_id,
  count(i.id) as total_tasks,
  count(i.id) filter (where i.status in ('open','in_progress')) as open_tasks,
  count(i.id) filter (where i.status = 'blocked') as blocked_tasks,
  count(i.id) filter (where i.status <> 'done' and i.due_at is not null and i.due_at < now()) as overdue_tasks
from public.tenants t
left join public.compliance_task_instances i on i.tenant_id = t.id
group by t.id;

-- Drop dependent view first, then function
drop view if exists public.v_dashboard_attention_ranked;
drop function if exists public.calculate_attention_score;

-- Phase 4: Recreate with new signature and weights
create or replace function public.calculate_attention_score(
  p_stage_score numeric,
  p_gaps_score numeric,
  p_risk_score numeric,
  p_staleness_score numeric,
  p_tasks_score numeric,
  p_renewal_score numeric,
  p_burn_score numeric
)
returns integer
language sql
immutable
set search_path = 'public'
as $$
  select round(
      (0.25 * p_stage_score)
    + (0.20 * p_gaps_score)
    + (0.15 * p_risk_score)
    + (0.15 * p_staleness_score)
    + (0.15 * p_tasks_score)
    + (0.05 * p_renewal_score)
    + (0.05 * p_burn_score)
  )::int;
$$;

-- Phase 3+5: Rebuild attention view with new task_score formula and drivers
create or replace view public.v_dashboard_attention_ranked
with (security_invoker = true)
as
with base as (
  select
    p.tenant_id,
    p.tenant_name,
    p.tenant_status,
    p.abn,
    p.rto_id,
    p.cricos_id,
    p.assigned_csc_user_id,
    p.packages_json,
    p.risk_status,
    p.risk_index,
    p.risk_index_delta_14d,
    p.worst_stage_health_status,
    p.critical_stage_count,
    p.at_risk_stage_count,
    p.open_tasks_count,
    p.overdue_tasks_count,
    p.mandatory_gaps_count,
    p.consult_hours_30d,
    p.burn_risk_status,
    p.projected_exhaustion_date,
    p.retention_status,
    p.composite_retention_risk_index,
    p.last_activity_at,
    tcp.renewal_window_start,
    coalesce(hsr.high_severity_open_risks, 0) as high_severity_open_risks,
    coalesce(extract(epoch from now() - p.last_activity_at) / 86400, 999)::integer as days_since_activity,
    case
      when tcp.renewal_window_start is not null then tcp.renewal_window_start - current_date
      else null
    end as days_to_renewal,
    coalesce(tm.overdue_tasks, 0)::integer as compliance_overdue_tasks,
    coalesce(tm.blocked_tasks, 0)::integer as compliance_blocked_tasks,
    coalesce(tm.open_tasks, 0)::integer as compliance_open_tasks
  from v_dashboard_tenant_portfolio p
  left join tenant_commercial_profiles tcp on tcp.tenant_id = p.tenant_id
  left join lateral (
    select count(*)::integer as high_severity_open_risks
    from risk_events re
    where re.tenant_id = p.tenant_id
      and re.severity = 'high'
      and re.status = 'open'
  ) hsr on true
  left join v_tenant_compliance_task_metrics tm on tm.tenant_id = p.tenant_id
),
sub_scores as (
  select
    b.*,
    least(100, greatest(0,
      case b.worst_stage_health_status
        when 'critical' then 100
        when 'at_risk' then 70
        when 'monitoring' then 35
        else 0
      end
      + least(b.critical_stage_count * 10, 20)
      + least(b.at_risk_stage_count * 5, 15)
    )) as stage_score,
    case when b.mandatory_gaps_count = 0 then 0
      else least(100, b.mandatory_gaps_count * 20)
    end as gaps_score,
    least(100, greatest(0,
      coalesce(b.risk_index, 0)::numeric
      + least(25, greatest(0, coalesce(b.risk_index_delta_14d, 0)::numeric * 1.5))
      + least(25, b.high_severity_open_risks * 10)::numeric
    ))::integer as risk_score,
    least(100,
      b.compliance_overdue_tasks * 25
      + b.compliance_blocked_tasks * 15
      + b.compliance_open_tasks * 3
    ) as task_score,
    least(100,
      case
        when b.days_since_activity <= 7 then 0
        when b.days_since_activity <= 14 then 25
        when b.days_since_activity <= 21 then 50
        when b.days_since_activity <= 30 then 75
        else 100
      end
      + case when b.open_tasks_count > 0 and b.days_since_activity >= 15 then 10 else 0 end
    ) as staleness_score,
    case
      when b.days_to_renewal is null then 0
      when b.days_to_renewal <= 0 then 100
      when b.days_to_renewal <= 14 then 100
      when b.days_to_renewal <= 30 then 75
      when b.days_to_renewal <= 60 then 50
      when b.days_to_renewal <= 90 then 25
      else 0
    end as renewal_score,
    least(100,
      case b.burn_risk_status
        when 'critical' then 100
        when 'accelerated' then 50
        else 0
      end
      + case when b.projected_exhaustion_date is not null
              and (b.projected_exhaustion_date - current_date) <= 30
            then 15 else 0 end
    ) as burn_score
  from base b
),
final as (
  select
    s.*,
    calculate_attention_score(
      s.stage_score::numeric,
      s.gaps_score::numeric,
      s.risk_score::numeric,
      s.staleness_score::numeric,
      s.task_score::numeric,
      s.renewal_score::numeric,
      s.burn_score::numeric
    ) as attention_score,
    (select jsonb_agg(sub.d order by (sub.d->>'impact')::integer desc)
     from (
       select d.value as d
       from jsonb_array_elements(jsonb_build_array(
         jsonb_build_object('driver','Critical stage',
           'value', s.critical_stage_count || ' critical, ' || s.at_risk_stage_count || ' at risk',
           'impact', round(0.25 * s.stage_score::numeric)),
         jsonb_build_object('driver','Mandatory gaps',
           'value', s.mandatory_gaps_count || ' missing categories',
           'impact', round(0.20 * s.gaps_score::numeric)),
         jsonb_build_object('driver','Rising risk',
           'value', case when coalesce(s.risk_index_delta_14d, 0) > 0
                         then '+' || s.risk_index_delta_14d || ' risk index in 14d'
                         else 'Index ' || coalesce(s.risk_index, 0) end,
           'impact', round(0.15 * s.risk_score::numeric)),
         jsonb_build_object('driver','Compliance Tasks',
           'value', s.compliance_overdue_tasks || ' overdue, ' || s.compliance_blocked_tasks || ' blocked',
           'impact', round(0.15 * s.task_score::numeric)),
         jsonb_build_object('driver','Inactivity',
           'value', s.days_since_activity || ' days since activity',
           'impact', round(0.15 * s.staleness_score::numeric)),
         jsonb_build_object('driver','Renewal pressure',
           'value', case when s.days_to_renewal is not null
                         then s.days_to_renewal || ' days to renewal'
                         else 'No renewal date' end,
           'impact', round(0.05 * s.renewal_score::numeric)),
         jsonb_build_object('driver','Burn pressure',
           'value', s.burn_risk_status,
           'impact', round(0.05 * s.burn_score::numeric))
       )) d(value)
       where (d.value->>'impact')::integer > 0
       limit 3
     ) sub
    ) as attention_drivers_json
  from sub_scores s
)
select
  f.tenant_id, f.tenant_name, f.tenant_status, f.abn, f.rto_id, f.cricos_id,
  f.assigned_csc_user_id, f.packages_json, f.risk_status, f.risk_index, f.risk_index_delta_14d,
  f.worst_stage_health_status, f.critical_stage_count, f.at_risk_stage_count,
  f.open_tasks_count, f.overdue_tasks_count, f.mandatory_gaps_count, f.consult_hours_30d,
  f.burn_risk_status, f.projected_exhaustion_date, f.retention_status,
  f.composite_retention_risk_index, f.last_activity_at, f.renewal_window_start,
  f.high_severity_open_risks, f.days_since_activity, f.days_to_renewal,
  f.compliance_overdue_tasks, f.compliance_blocked_tasks, f.compliance_open_tasks,
  f.stage_score, f.gaps_score, f.risk_score, f.task_score,
  f.staleness_score, f.renewal_score, f.burn_score,
  f.attention_score, f.attention_drivers_json
from final f
order by f.attention_score desc, f.critical_stage_count desc, f.mandatory_gaps_count desc,
         f.risk_index_delta_14d desc, f.days_since_activity desc, f.renewal_window_start;
