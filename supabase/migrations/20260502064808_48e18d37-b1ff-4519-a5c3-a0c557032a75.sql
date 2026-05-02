create or replace view public.v_admin_zero_progress_packages
with (security_invoker = true) as
with stage_counts as (
  select
    si.packageinstance_id,
    count(*)::int                                                          as stages_total,
    count(*) filter (where si.status_id in (2,3))::int                     as stages_complete,
    count(*) filter (where coalesce(si.released_client_tasks,false))::int  as stages_released,
    max(si.updated_at)                                                     as max_stage_updated_at
  from public.stage_instances si
  group by si.packageinstance_id
),
task_counts as (
  select cai.package_id::bigint as package_instance_id,
         count(*)                                              as ai_total,
         count(*) filter (where cai.completed_at is not null)  as ai_completed,
         max(cai.updated_at)                                   as max_ai_updated_at
  from public.client_action_items cai
  where cai.package_id is not null
  group by cai.package_id
),
legacy_task_counts as (
  select si.packageinstance_id                                                    as package_instance_id,
         count(*)                                                                 as ti_total,
         count(*) filter (where cti.completion_date is not null)                  as ti_completed,
         count(*) filter (where coalesce(cti.is_archived,false)=false
                            and cti.completion_date is null)                      as ti_open,
         max(cti.updated_at)                                                      as max_ti_updated_at
  from public.client_task_instances cti
  join public.stage_instances si on si.id = cti.stageinstance_id
  group by si.packageinstance_id
),
hours as (
  select te.package_instance_id::bigint as package_instance_id,
         coalesce(sum(te.duration_minutes), 0)::numeric / 60.0  as hours_logged,
         max(te.start_at)                                       as max_te_at
  from public.time_entries te
  where te.package_instance_id is not null
  group by te.package_instance_id
)
select
  pi.id                                                            as package_instance_id,
  pi.tenant_id::bigint                                             as tenant_id,
  t.name                                                           as tenant_name,
  t.legal_name                                                     as tenant_legal_name,
  p.name                                                           as package_name,
  p.package_type                                                   as package_type,
  pi.manager_id                                                    as manager_id,
  pi.start_date                                                    as start_date,
  pi.end_date                                                      as end_date,
  (current_date - pi.start_date)                                   as days_since_start,
  pi.is_active                                                     as is_active,
  pi.is_complete                                                   as is_complete,
  coalesce(sc.stages_total, 0)                                     as stages_total,
  coalesce(sc.stages_complete, 0)                                  as stages_complete,
  coalesce(sc.stages_released, 0)                                  as stages_released,
  coalesce(tc.ai_total, 0)                                         as action_items_total,
  coalesce(tc.ai_completed, 0)                                     as action_items_completed,
  coalesce(ltc.ti_total, 0)                                        as legacy_tasks_total,
  coalesce(ltc.ti_completed, 0)                                    as legacy_tasks_completed,
  coalesce(ltc.ti_open, 0)                                         as legacy_tasks_open,
  coalesce(h.hours_logged, 0)::numeric                             as hours_logged,
  greatest(
    coalesce(sc.max_stage_updated_at, 'epoch'::timestamptz),
    coalesce(tc.max_ai_updated_at,    'epoch'::timestamptz),
    coalesce(ltc.max_ti_updated_at,   'epoch'::timestamptz),
    coalesce(h.max_te_at,             'epoch'::timestamptz)
  )                                                                as last_activity_at,
  case
    when coalesce(sc.stages_released, 0) = 0
      and coalesce(tc.ai_completed, 0) + coalesce(ltc.ti_completed, 0) = 0
      and coalesce(h.hours_logged, 0) = 0
      then 'pre_release'
    when greatest(
           coalesce(sc.max_stage_updated_at, 'epoch'::timestamptz),
           coalesce(tc.max_ai_updated_at,    'epoch'::timestamptz),
           coalesce(ltc.max_ti_updated_at,   'epoch'::timestamptz),
           coalesce(h.max_te_at,             'epoch'::timestamptz)
         ) < (now() - interval '90 days')
      then 'dormant'
    when coalesce(tc.ai_completed, 0) + coalesce(ltc.ti_completed, 0) > 0
      or coalesce(h.hours_logged, 0) > 0
      or greatest(
           coalesce(sc.max_stage_updated_at, 'epoch'::timestamptz),
           coalesce(tc.max_ai_updated_at,    'epoch'::timestamptz),
           coalesce(ltc.max_ti_updated_at,   'epoch'::timestamptz),
           coalesce(h.max_te_at,             'epoch'::timestamptz)
         ) > (now() - interval '30 days')
      then 'investigate'
    else 'review'
  end                                                              as triage_category
from public.package_instances pi
join public.tenants t                  on t.id = pi.tenant_id
join public.packages p                 on p.id = pi.package_id
left join stage_counts sc              on sc.packageinstance_id = pi.id
left join task_counts tc               on tc.package_instance_id = pi.id
left join legacy_task_counts ltc       on ltc.package_instance_id = pi.id
left join hours h                      on h.package_instance_id = pi.id
where pi.is_active = true
  and coalesce(pi.is_complete, false) = false
  and pi.start_date is not null
  and pi.start_date < (current_date - interval '60 days')
  and coalesce(sc.stages_complete, 0) = 0;

grant select on public.v_admin_zero_progress_packages to authenticated;

comment on view public.v_admin_zero_progress_packages is
  'SuperAdmin diagnostic: active packages 60+ days old with stages_complete=0. Triage categories: pre_release | dormant | investigate | review. Strictly additive. Access enforced at the page level (SuperAdmin only).';