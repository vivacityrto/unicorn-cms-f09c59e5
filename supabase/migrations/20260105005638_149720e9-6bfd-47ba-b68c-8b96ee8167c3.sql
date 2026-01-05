-- Drop existing function and recreate with new signature
drop function if exists public.get_membership_rollups();

create function public.get_membership_rollups()
returns table (
  tenant_id bigint,
  package_id bigint,
  next_action_title text,
  next_action_due_at date,
  next_action_owner_id uuid,
  next_action_source text,
  next_action_reason text,
  risk_flags jsonb,
  current_stage_name text,
  current_stage_status text,
  progress_percent int,
  phase text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_waiting_threshold_days int := 7;
  v_stage_overdue_days int := 14;
begin
  -- Get thresholds
  select coalesce(waiting_too_long_days, 7), coalesce(stage_overdue_days, 14)
  into v_waiting_threshold_days, v_stage_overdue_days
  from public.package_type_thresholds
  where package_type = 'membership'
  limit 1;

  return query
  with stage_states as (
    select 
      cpss.tenant_id,
      cpss.package_id,
      cpss.id as stage_state_id,
      cpss.status,
      cpss.sort_order,
      cpss.is_required,
      cpss.waiting_at,
      cpss.waiting_reason,
      cpss.blocked_at,
      cpss.blocked_reason,
      cpss.started_at,
      cpss.completed_at,
      ds.title as stage_name,
      ds.stage_type
    from public.client_package_stage_state cpss
    join public.documents_stages ds on ds.id = cpss.stage_id
  ),
  current_stages as (
    select distinct on (ss.tenant_id, ss.package_id)
      ss.tenant_id,
      ss.package_id,
      ss.stage_name,
      ss.status,
      ss.stage_type,
      ss.waiting_at,
      ss.waiting_reason,
      ss.blocked_at,
      ss.blocked_reason,
      ss.started_at
    from stage_states ss
    where ss.status = 'in_progress'
    order by ss.tenant_id, ss.package_id, ss.sort_order
  ),
  progress as (
    select 
      ss.tenant_id,
      ss.package_id,
      count(*) filter (where ss.status = 'complete' and ss.is_required) as completed,
      count(*) filter (where ss.is_required) as total
    from stage_states ss
    group by ss.tenant_id, ss.package_id
  ),
  tasks as (
    select 
      mt.tenant_id,
      mt.package_id,
      mt.title,
      mt.due_date,
      mt.assigned_to,
      mt.status
    from public.membership_tasks mt
    where mt.status in ('pending', 'in_progress')
    order by mt.due_date asc nulls last
  ),
  first_tasks as (
    select distinct on (t.tenant_id, t.package_id)
      t.tenant_id,
      t.package_id,
      t.title,
      t.due_date,
      t.assigned_to
    from tasks t
    order by t.tenant_id, t.package_id, t.due_date asc nulls last
  ),
  risk_data as (
    select
      me.tenant_id,
      me.package_id,
      jsonb_agg(
        jsonb_build_object(
          'code', rf.code,
          'severity', rf.severity,
          'message', rf.message,
          'source', rf.source
        )
      ) filter (where rf.code is not null) as flags
    from public.membership_entitlements me
    left join lateral (
      -- WAITING_TOO_LONG
      select 
        'WAITING_TOO_LONG' as code,
        'warn' as severity,
        'Stage waiting for ' || extract(day from now() - cs.waiting_at)::int || ' days: ' || coalesce(cs.waiting_reason, 'No reason') as message,
        'stage' as source
      from current_stages cs
      where cs.tenant_id = me.tenant_id 
        and cs.package_id = me.package_id
        and cs.status = 'in_progress'
        and cs.waiting_at is not null
        and now() - cs.waiting_at > (v_waiting_threshold_days || ' days')::interval
      
      union all
      
      -- STAGE_OVERDUE
      select 
        'STAGE_OVERDUE' as code,
        'critical' as severity,
        'Stage "' || cs.stage_name || '" overdue by ' || (extract(day from now() - cs.started_at)::int - v_stage_overdue_days) || ' days' as message,
        'stage' as source
      from current_stages cs
      where cs.tenant_id = me.tenant_id 
        and cs.package_id = me.package_id
        and cs.status = 'in_progress'
        and cs.started_at is not null
        and now() - cs.started_at > (v_stage_overdue_days || ' days')::interval
      
      union all
      
      -- MISSING_CSC
      select 
        'MISSING_CSC' as code,
        'warn' as severity,
        'No CSC assigned' as message,
        'system' as source
      where me.csc_user_id is null
      
      union all
      
      -- OVERDUE_TASKS
      select 
        'OVERDUE_TASKS' as code,
        'critical' as severity,
        count(*)::text || ' overdue task(s)' as message,
        'task' as source
      from public.membership_tasks mt
      where mt.tenant_id = me.tenant_id 
        and mt.package_id = me.package_id
        and mt.status in ('pending', 'in_progress')
        and mt.due_date < current_date
      having count(*) > 0
    ) rf on true
    group by me.tenant_id, me.package_id
  )
  select
    me.tenant_id,
    me.package_id,
    coalesce(ft.title, 'Review status') as next_action_title,
    ft.due_date as next_action_due_at,
    ft.assigned_to as next_action_owner_id,
    case when ft.title is not null then 'task' else 'system' end as next_action_source,
    case when ft.title is null then 'No open tasks' else '' end as next_action_reason,
    coalesce(rd.flags, '[]'::jsonb) as risk_flags,
    cs.stage_name as current_stage_name,
    cs.status as current_stage_status,
    case 
      when p.total > 0 then (p.completed * 100 / p.total)::int 
      else 0 
    end as progress_percent,
    case 
      when cs.stage_type in ('delivery', 'review') then 'Delivery'
      when cs.stage_type = 'submission' then 'Submission'
      when cs.stage_type = 'waiting' then 'External'
      when cs.stage_type = 'closeout' then 'Closeout'
      when cs.stage_type in ('entitlement', 'recurring') then 'Ongoing'
      when cs.stage_type = 'setup' then 'Setup'
      else 'Setup'
    end as phase
  from public.membership_entitlements me
  left join current_stages cs on cs.tenant_id = me.tenant_id and cs.package_id = me.package_id
  left join progress p on p.tenant_id = me.tenant_id and p.package_id = me.package_id
  left join first_tasks ft on ft.tenant_id = me.tenant_id and ft.package_id = me.package_id
  left join risk_data rd on rd.tenant_id = me.tenant_id and rd.package_id = me.package_id;
end;
$$;