-- v_client_package_stages
-- Purpose: per-package list of stage_instances for the client journey stepper.
-- Strictly additive. security_invoker delegates RLS to underlying tables.

create or replace view public.v_client_package_stages
with (security_invoker = true) as
select
  pi.id                                         as package_instance_id,
  pi.tenant_id::bigint                          as tenant_id,
  si.id                                         as stage_instance_id,
  s.id                                          as stage_id,
  si.stage_sortorder                            as stage_sortorder,
  s.name                                        as stage_name,
  coalesce(nullif(trim(s.shortname), ''), s.name) as stage_shortname,
  s.description                                 as stage_description,
  s.is_recurring                                as is_recurring,
  coalesce(s.is_audit_workspace, false)         as is_audit_workspace,
  si.completion_date                            as completion_date,
  si.status                                     as raw_status,
  coalesce(si.released_client_tasks, false)     as released_client_tasks,
  si.released_client_tasks_date                 as released_client_tasks_date,
  si.event_conducted_date                       as event_conducted_date,
  si.updated_at                                 as updated_at,
  case
    when si.completion_date is not null then 'complete'
    when si.id = (
      select si2.id
      from public.stage_instances si2
      join public.stages s2 on s2.id = si2.stage_id
      where si2.packageinstance_id = pi.id
        and si2.completion_date is null
        and coalesce(s2.is_archived, false) = false
        and coalesce(s2.is_audit_workspace, false) = false
      order by si2.stage_sortorder asc
      limit 1
    ) then 'current'
    else 'future'
  end                                           as node_state
from public.package_instances pi
join public.stage_instances si on si.packageinstance_id = pi.id
join public.stages s           on s.id = si.stage_id
where coalesce(s.is_archived, false) = false
  and coalesce(s.is_audit_workspace, false) = false;

grant select on public.v_client_package_stages to authenticated;

comment on view public.v_client_package_stages is
  'Client-portal stage journey for a package_instance. Strictly additive. Excludes archived stages and audit workspaces. node_state: complete | current | future.';

-- v_client_package_whats_next
-- Top three open client-facing tasks per package_instance, ranked by urgency.
create or replace view public.v_client_package_whats_next
with (security_invoker = true) as
with combined as (
  select
    cai.package_id::bigint                            as package_instance_id,
    cai.tenant_id::bigint                             as tenant_id,
    cai.id::text                                      as task_uid,
    'action_item'::text                               as source,
    cai.title                                         as title,
    cai.description                                   as description,
    cai.due_date::timestamptz                         as due_at,
    cai.priority                                      as priority,
    cai.created_at                                    as created_at,
    cai.updated_at                                    as updated_at,
    cai.recurrence_rule                               as recurrence_rule,
    cai.item_type                                     as item_type
  from public.client_action_items cai
  where cai.completed_at is null
    and (cai.status is null or cai.status not in ('completed','cancelled'))

  union all

  select
    si.packageinstance_id::bigint                     as package_instance_id,
    pi.tenant_id::bigint                              as tenant_id,
    cti.id::text                                      as task_uid,
    'task_instance'::text                             as source,
    coalesce(ct.name, 'Task #' || cti.id::text)       as title,
    ct.description                                    as description,
    cti.due_date::timestamptz                         as due_at,
    null::text                                        as priority,
    cti.created_at                                    as created_at,
    cti.updated_at                                    as updated_at,
    null::text                                        as recurrence_rule,
    null::text                                        as item_type
  from public.client_task_instances cti
  join public.stage_instances si on si.id = cti.stageinstance_id
  join public.package_instances pi on pi.id = si.packageinstance_id
  left join public.client_tasks ct on ct.id = cti.clienttask_id
  where coalesce(cti.is_archived, false) = false
    and cti.completion_date is null
    and coalesce(si.released_client_tasks, false) = true
),
ranked as (
  select
    c.*,
    case
      when c.due_at is not null and c.due_at < now() then 'overdue'
      when c.due_at is not null and c.due_at < now() + interval '7 days' then 'due_soon'
      when c.item_type ilike 'recurring%' or c.recurrence_rule is not null then 'recurring'
      when c.due_at is not null then 'upcoming'
      else 'untimed'
    end                                                                       as urgency,
    case
      when c.due_at is not null and c.due_at < now() then 1
      when c.due_at is not null and c.due_at < now() + interval '7 days' then 2
      when c.due_at is not null then 3
      when c.item_type ilike 'recurring%' or c.recurrence_rule is not null then 4
      else 5
    end                                                                       as urgency_rank,
    row_number() over (
      partition by c.package_instance_id
      order by
        case
          when c.due_at is not null and c.due_at < now() then 1
          when c.due_at is not null and c.due_at < now() + interval '7 days' then 2
          when c.due_at is not null then 3
          when c.item_type ilike 'recurring%' or c.recurrence_rule is not null then 4
          else 5
        end asc,
        coalesce(c.due_at, 'infinity'::timestamptz) asc,
        c.created_at asc
    )                                                                         as rn
  from combined c
)
select
  package_instance_id,
  tenant_id,
  task_uid,
  source,
  title,
  description,
  due_at,
  priority,
  urgency,
  urgency_rank,
  rn                                          as rank_in_package,
  created_at,
  updated_at
from ranked
where rn <= 3;

grant select on public.v_client_package_whats_next to authenticated;

comment on view public.v_client_package_whats_next is
  'Top 3 open client-facing tasks per package_instance. Strictly additive. Modern: client_action_items by package_id. Legacy: client_task_instances joined via stage_instances and gated by released_client_tasks=true. Ranked by urgency.';
