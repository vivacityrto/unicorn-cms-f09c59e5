-- Client-safe activity analytics for ONE package instance, for the package page's timeline, heatmap, mix and weekly
-- snapshot. Read-only: creates one function, changes no table and no data.
--
-- Same rules as the existing client package functions (get_client_package_hours_by_type and
-- get_client_package_hours_timeline): SECURITY DEFINER, the tenant is checked against the package instance AND the
-- caller (app.user_can_access_tenant), billable time only, carry-over excluded, same renewal window, minutes taken
-- from allocations where an entry is split across packages.
--
-- What it returns (all aggregated, nothing identifying):
--   daily        hours per day per work type (no consultant, no time-entry notes)
--   touchpoints  weekly COUNTS of Vivacity's internal notes on this package for four allow-listed kinds only
--                (email, meeting, call, follow-up). No note text, titles, tags, assignees, attachments, and nothing
--                for any other kind (so no escalation, risk or general notes), so this is "how often we have been in
--                touch" and never what was said.
--   tasks        weekly counts of tasks created and completed that are visible to the client (item_type = 'client')
--   documents    weekly count of documents generated for this package
--   window       the renewal window the figures cover
--
-- Staff names, note content and anything internal are never returned.

create or replace function public.get_client_package_activity(p_tenant_id bigint, p_package_instance_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_start timestamp;
  v_end timestamp;
  result jsonb;
begin
  if not app.user_can_access_tenant(p_tenant_id) then
    raise exception 'Not authorized for this tenant';
  end if;

  select coalesce(pi.start_renewal_date::timestamp, pi.start_date::timestamp),
         coalesce(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')
    into v_start, v_end
  from public.package_instances pi
  where pi.id = p_package_instance_id
    and pi.tenant_id = p_tenant_id;

  if v_start is null then
    return jsonb_build_object('window', null, 'daily', '[]'::jsonb, 'touchpoints', '[]'::jsonb, 'tasks', '[]'::jsonb, 'documents', '[]'::jsonb);
  end if;

  with per_entry as (
    select
      (te.start_at at time zone 'Australia/Sydney')::date as day,
      coalesce(nullif(trim(te.work_type), ''), 'Other') as work_type,
      tea.allocated_minutes::numeric as minutes
    from public.time_entry_allocations tea
    join public.time_entries te on te.id = tea.time_entry_id
    where tea.package_instance_id = p_package_instance_id
      and te.duration_minutes is not null and te.duration_minutes > 0
      and te.is_billable = true
      and te.work_type <> 'carry_over'
      and te.start_at >= v_start and te.start_at < v_end
    union all
    select
      (te.start_at at time zone 'Australia/Sydney')::date,
      coalesce(nullif(trim(te.work_type), ''), 'Other'),
      te.duration_minutes::numeric
    from public.time_entries te
    where te.package_instance_id = p_package_instance_id
      and te.duration_minutes is not null and te.duration_minutes > 0
      and te.is_billable = true
      and te.work_type <> 'carry_over'
      and not exists (select 1 from public.time_entry_allocations tea2 where tea2.time_entry_id = te.id)
      and te.start_at >= v_start and te.start_at < v_end
  ),
  daily as (
    select day, work_type, round(sum(minutes))::integer as minutes, count(*)::integer as entries
    from per_entry
    group by day, work_type
  ),
  touch as (
    select
      date_trunc('week', n.created_at at time zone 'Australia/Sydney')::date as week_start,
      case
        when n.note_type = 'email' then 'email'
        when n.note_type = 'meeting' then 'meeting'
        when n.note_type in ('phone-call', 'phone') then 'call'
        when n.note_type = 'follow-up' then 'follow_up'
      end as kind,
      count(*)::integer as count
    from public.notes n
    where n.parent_type = 'package_instance'
      and n.parent_id = p_package_instance_id
      and n.note_type in ('email', 'meeting', 'phone-call', 'phone', 'follow-up')
      and n.created_at >= v_start and n.created_at < v_end
    group by 1, 2
  ),
  task_weeks as (
    select week_start, sum(created)::integer as created, sum(completed)::integer as completed
    from (
      select date_trunc('week', ci.created_at at time zone 'Australia/Sydney')::date as week_start, 1 as created, 0 as completed
      from public.client_action_items ci
      where ci.package_instance_id = p_package_instance_id and ci.item_type = 'client'
        and ci.created_at >= v_start and ci.created_at < v_end
      union all
      select date_trunc('week', ci.completed_at at time zone 'Australia/Sydney')::date, 0, 1
      from public.client_action_items ci
      where ci.package_instance_id = p_package_instance_id and ci.item_type = 'client'
        and ci.completed_at is not null and ci.completed_at >= v_start and ci.completed_at < v_end
    ) t
    group by week_start
  ),
  doc_weeks as (
    select date_trunc('week', di.generationdate)::date as week_start, count(*)::integer as count
    from public.document_instances di
    join public.stage_instances si on si.id = di.stageinstance_id
    where si.packageinstance_id = p_package_instance_id
      and di.isgenerated = true
      and di.generationdate is not null
      and di.generationdate >= v_start and di.generationdate < v_end
    group by 1
  )
  select jsonb_build_object(
    'window', jsonb_build_object('start', v_start::date, 'end', v_end::date),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day, d.work_type) from daily d), '[]'::jsonb),
    'touchpoints', coalesce((select jsonb_agg(to_jsonb(t) order by t.week_start, t.kind) from touch t where t.kind is not null), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(w) order by w.week_start) from task_weeks w), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(w) order by w.week_start) from doc_weeks w), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

revoke execute on function public.get_client_package_activity(bigint, bigint) from public;
revoke execute on function public.get_client_package_activity(bigint, bigint) from anon;
grant execute on function public.get_client_package_activity(bigint, bigint) to authenticated;
