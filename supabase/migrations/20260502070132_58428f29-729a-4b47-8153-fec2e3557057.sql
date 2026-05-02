create or replace view public.v_client_package_dashboard
with (security_invoker = true) as
with stage_agg as (
  select
    si.packageinstance_id as package_instance_id,
    count(*)::integer as stages_total,
    count(*) filter (where si.status_id = any (array[2, 3]))::integer as stages_complete,
    min(si.stage_sortorder) filter (where si.status_id is null or (si.status_id <> all (array[2, 3]))) as current_stage_sortorder,
    max(si.updated_at) as stage_last_updated
  from public.stage_instances si
  group by si.packageinstance_id
), action_items_agg as (
  select
    cai.package_id as package_instance_id,
    count(*)::integer as open_count,
    count(*) filter (where cai.due_date < now()::date)::integer as overdue_count,
    max(cai.updated_at) as last_updated
  from public.client_action_items cai
  where cai.package_id is not null
    and cai.completed_at is null
    and (coalesce(cai.status, 'open'::text) <> all (array['completed'::text, 'cancelled'::text]))
  group by cai.package_id
), task_instances_agg as (
  select
    si.packageinstance_id as package_instance_id,
    count(*)::integer as open_count,
    count(*) filter (where cti.due_date < now())::integer as overdue_count,
    max(cti.updated_at) as last_updated
  from public.client_task_instances cti
    join public.stage_instances si on si.id = cti.stageinstance_id
  where coalesce(cti.is_archived, false) = false
    and cti.completion_date is null
    and coalesce(cti.status, 0) <> 2
    and coalesce(si.released_client_tasks, false) = true
  group by si.packageinstance_id
), tasks_agg as (
  select
    coalesce(a.package_instance_id, t.package_instance_id) as package_instance_id,
    coalesce(a.open_count, 0) + coalesce(t.open_count, 0) as open_tasks,
    coalesce(a.overdue_count, 0) + coalesce(t.overdue_count, 0) as overdue_tasks,
    greatest(a.last_updated, t.last_updated) as tasks_last_updated
  from action_items_agg a
    full join task_instances_agg t on t.package_instance_id = a.package_instance_id
), notes_agg as (
  select
    n.parent_id as package_instance_id,
    max(n.updated_at) as notes_last_updated
  from public.notes n
  where n.parent_type = 'package_instance'::text and n.parent_id is not null
  group by n.parent_id
), pinned as (
  select distinct on (n.parent_id)
    n.parent_id as package_instance_id,
    n.title as pinned_note_title,
    n.note_details as pinned_note_text,
    n.priority as pinned_note_priority,
    n.updated_at as pinned_note_updated_at
  from public.notes n
  where n.parent_type = 'package_instance'::text and n.is_pinned = true and n.parent_id is not null
  order by n.parent_id, n.updated_at desc nulls last
), hours_agg as (
  -- Live hours from time_entries, scoped to current package period to exclude
  -- pre-period mis-attributions from package renewal flows. Mirrors the staff
  -- burndown widget. pi.hours_used is abandoned across the platform.
  select
    te.package_instance_id::bigint as package_instance_id,
    coalesce(sum(te.duration_minutes), 0)::numeric / 60.0 as hours_used_calc,
    max(te.start_at) as max_te_at
  from public.time_entries te
    join public.package_instances pi2 on pi2.id = te.package_instance_id
  where te.package_instance_id is not null
    and te.duration_minutes is not null
    and te.duration_minutes > 0
    and (pi2.start_date is null or te.start_at >= pi2.start_date)
  group by te.package_instance_id
)
select
  pi.id as package_instance_id,
  pi.tenant_id,
  p.name as package_name,
  p.package_type,
  p.progress_mode,
  pi.manager_id,
  pi.is_complete,
  pi.start_date,
  pi.end_date,
  coalesce(pi.hours_included, 0) as hours_included,
  coalesce(pi.hours_added, 0) as hours_added,
  -- Hours sourced from packages.total_hours + pi.hours_added.
  -- pi.hours_included and pi.hours_used are abandoned fields — do not read.
  (coalesce(p.total_hours, 0) + coalesce(pi.hours_added, 0))::numeric as hours_total,
  coalesce(ha.hours_used_calc, 0)::numeric as hours_used,
  greatest(
    (coalesce(p.total_hours, 0) + coalesce(pi.hours_added, 0))::numeric
      - coalesce(ha.hours_used_calc, 0)::numeric,
    0::numeric
  ) as hours_remaining,
  case
    when (coalesce(p.total_hours, 0) + coalesce(pi.hours_added, 0)) = 0 then 0::numeric
    else round(
      coalesce(ha.hours_used_calc, 0)::numeric
      / (coalesce(p.total_hours, 0) + coalesce(pi.hours_added, 0))::numeric,
      4
    )
  end as hours_pct_used,
  coalesce(sa.stages_total, 0) as stages_total,
  coalesce(sa.stages_complete, 0) as stages_complete,
  sa.current_stage_sortorder,
  coalesce(ta.open_tasks, 0) as open_tasks,
  coalesce(ta.overdue_tasks, 0) as overdue_tasks,
  greatest(
    coalesce(na.notes_last_updated,  'epoch'::timestamptz),
    coalesce(sa.stage_last_updated,  'epoch'::timestamptz),
    coalesce(ta.tasks_last_updated,  'epoch'::timestamptz),
    coalesce(ha.max_te_at,           'epoch'::timestamptz)
  ) as last_activity_at,
  pn.pinned_note_title,
  pn.pinned_note_text,
  pn.pinned_note_priority,
  pn.pinned_note_updated_at,
  case
    when pn.pinned_note_text is null and pn.pinned_note_title is null then null::text
    when lower((coalesce(pn.pinned_note_text, ''::text) || ' '::text) || coalesce(pn.pinned_note_title, ''::text)) like '%on hold%' then 'hold'::text
    when lower((coalesce(pn.pinned_note_text, ''::text) || ' '::text) || coalesce(pn.pinned_note_title, ''::text)) ~ '(urgent|overdue)'::text then 'urgent'::text
    else 'info'::text
  end as pinned_note_severity,
  case
    when pn.pinned_note_text is not null
      and lower((coalesce(pn.pinned_note_text, ''::text) || ' '::text) || coalesce(pn.pinned_note_title, ''::text)) like '%on hold%'
      then 'on_hold'::text
    when pi.is_complete = true then 'complete'::text
    when greatest(
           coalesce(na.notes_last_updated,  'epoch'::timestamptz),
           coalesce(sa.stage_last_updated,  'epoch'::timestamptz),
           coalesce(ta.tasks_last_updated,  'epoch'::timestamptz),
           coalesce(ha.max_te_at,           'epoch'::timestamptz)
         ) < (now() - '30 days'::interval)
      or ((coalesce(p.total_hours, 0) + coalesce(pi.hours_added, 0)) > 0
          and (coalesce(ha.hours_used_calc, 0)::numeric
               / (coalesce(p.total_hours, 0) + coalesce(pi.hours_added, 0))::numeric) >= 0.95)
      then 'stuck'::text
    when greatest(
           coalesce(na.notes_last_updated,  'epoch'::timestamptz),
           coalesce(sa.stage_last_updated,  'epoch'::timestamptz),
           coalesce(ta.tasks_last_updated,  'epoch'::timestamptz),
           coalesce(ha.max_te_at,           'epoch'::timestamptz)
         ) < (now() - '14 days'::interval)
      or ((coalesce(p.total_hours, 0) + coalesce(pi.hours_added, 0)) > 0
          and (coalesce(ha.hours_used_calc, 0)::numeric
               / (coalesce(p.total_hours, 0) + coalesce(pi.hours_added, 0))::numeric) >= 0.75)
      or coalesce(ta.overdue_tasks, 0) > 0
      then 'drifting'::text
    else 'on_track'::text
  end as status_pill
from public.package_instances pi
  join public.packages p on p.id = pi.package_id
  left join stage_agg sa on sa.package_instance_id = pi.id
  left join tasks_agg ta on ta.package_instance_id = pi.id
  left join notes_agg na on na.package_instance_id = pi.id
  left join pinned pn on pn.package_instance_id = pi.id
  left join hours_agg ha on ha.package_instance_id = pi.id;

comment on view public.v_client_package_dashboard is
  'Client-portal package dashboard payload. Strictly additive. '
  'Stage completion uses status_id IN (2,3) per v_phase_progress_summary. '
  'Hours total = packages.total_hours + pi.hours_added. '
  'Hours used = sum of time_entries.duration_minutes within package period (start_at >= pi.start_date). '
  'pi.hours_included and pi.hours_used are abandoned fields — do not read. '
  'Tasks count only released client tasks (released_client_tasks=true) plus action items. '
  'Pinned notes from public.notes (parent_type=package_instance). '
  'security_invoker=true delegates RLS to underlying tables. '
  'Companion hook: src/hooks/use-client-package-dashboard.ts.';