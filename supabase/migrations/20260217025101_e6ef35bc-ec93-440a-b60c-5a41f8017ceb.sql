
-- =============================================================
-- Two-Lane Task Model: Compliance Tasks + Internal Ops Tracker
-- =============================================================

-- 1. Drop Phase 1 prototype tables (empty, safe to remove)
drop view if exists public.v_tenant_required_tasks cascade;
drop table if exists public.tenant_task_instances cascade;
drop table if exists public.task_requirements cascade;
drop table if exists public.task_definitions cascade;

-- =============================================================
-- LANE 1: Compliance Tasks (auditable, tenant + package driven)
-- =============================================================

-- 1A. compliance_task_definitions
create table if not exists public.compliance_task_definitions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text null,
  standards_2025_clause text null,
  risk_weight integer not null default 1 check (risk_weight between 1 and 5),
  created_by uuid null references public.users(user_uuid) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ctd_clause
on public.compliance_task_definitions (standards_2025_clause);

alter table public.compliance_task_definitions enable row level security;

create policy ctd_staff_select on public.compliance_task_definitions
  for select to authenticated
  using (public.is_vivacity_staff(auth.uid()));

create policy ctd_staff_insert on public.compliance_task_definitions
  for insert to authenticated
  with check (public.is_vivacity_staff(auth.uid()));

create policy ctd_staff_update on public.compliance_task_definitions
  for update to authenticated
  using (public.is_vivacity_staff(auth.uid()))
  with check (public.is_vivacity_staff(auth.uid()));

create policy ctd_staff_delete on public.compliance_task_definitions
  for delete to authenticated
  using (public.is_vivacity_staff(auth.uid()));

-- 1B. compliance_task_requirements
create table if not exists public.compliance_task_requirements (
  id uuid primary key default gen_random_uuid(),
  task_definition_id uuid not null
    references public.compliance_task_definitions(id) on delete cascade,
  scope_type text not null check (scope_type in ('package','tenant')),
  package_id bigint null references public.packages(id) on delete cascade,
  tenant_id bigint null references public.tenants(id) on delete cascade,
  due_days_after_start integer null,
  is_required boolean not null default true,
  created_by uuid null references public.users(user_uuid) on delete set null,
  created_at timestamptz not null default now(),
  constraint compliance_task_requirements_scope_chk check (
    (scope_type = 'package' and package_id is not null and tenant_id is null)
    or
    (scope_type = 'tenant' and tenant_id is not null and package_id is null)
  )
);

create index if not exists idx_ctr_package
on public.compliance_task_requirements (package_id) where scope_type = 'package';

create index if not exists idx_ctr_tenant
on public.compliance_task_requirements (tenant_id) where scope_type = 'tenant';

alter table public.compliance_task_requirements enable row level security;

create policy ctr_staff_select on public.compliance_task_requirements
  for select to authenticated
  using (public.is_vivacity_staff(auth.uid()));

create policy ctr_staff_insert on public.compliance_task_requirements
  for insert to authenticated
  with check (public.is_vivacity_staff(auth.uid()));

create policy ctr_staff_update on public.compliance_task_requirements
  for update to authenticated
  using (public.is_vivacity_staff(auth.uid()))
  with check (public.is_vivacity_staff(auth.uid()));

create policy ctr_staff_delete on public.compliance_task_requirements
  for delete to authenticated
  using (public.is_vivacity_staff(auth.uid()));

-- 1C. compliance_task_instances
create table if not exists public.compliance_task_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  requirement_id uuid not null references public.compliance_task_requirements(id) on delete cascade,
  status text not null default 'open'
    check (status in ('open','in_progress','done','blocked','n_a')),
  due_at timestamptz null,
  completed_at timestamptz null,
  completed_by uuid null references public.users(user_uuid) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, requirement_id)
);

create index if not exists idx_cti_tenant_status
on public.compliance_task_instances (tenant_id, status);

create index if not exists idx_cti_due
on public.compliance_task_instances (due_at) where status <> 'done';

alter table public.compliance_task_instances enable row level security;

create policy cti_staff_select on public.compliance_task_instances
  for select to authenticated
  using (
    public.is_vivacity_staff(auth.uid())
    and public.can_access_tenant(auth.uid(), tenant_id)
  );

create policy cti_staff_insert on public.compliance_task_instances
  for insert to authenticated
  with check (
    public.is_vivacity_staff(auth.uid())
    and public.can_access_tenant(auth.uid(), tenant_id)
  );

create policy cti_staff_update on public.compliance_task_instances
  for update to authenticated
  using (
    public.is_vivacity_staff(auth.uid())
    and public.can_access_tenant(auth.uid(), tenant_id)
  )
  with check (
    public.is_vivacity_staff(auth.uid())
    and public.can_access_tenant(auth.uid(), tenant_id)
  );

-- 1D. Expanded requirements view
create or replace view public.v_compliance_task_requirements_expanded
with (security_invoker = true)
as
with package_scope as (
  select
    pi.tenant_id,
    ctr.id as requirement_id,
    ctr.task_definition_id,
    ctr.due_days_after_start,
    pi.start_date::timestamptz as start_at
  from public.compliance_task_requirements ctr
  join public.package_instances pi
    on pi.package_id = ctr.package_id
   and pi.is_active = true
   and coalesce(pi.is_complete, false) = false
  where ctr.scope_type = 'package'
),
tenant_scope as (
  select
    ctr.tenant_id,
    ctr.id as requirement_id,
    ctr.task_definition_id,
    ctr.due_days_after_start,
    null::timestamptz as start_at
  from public.compliance_task_requirements ctr
  where ctr.scope_type = 'tenant'
)
select
  x.tenant_id,
  x.requirement_id,
  x.task_definition_id,
  case
    when x.due_days_after_start is null then null
    when x.start_at is null then null
    else x.start_at + (x.due_days_after_start || ' days')::interval
  end as calculated_due_at
from (
  select * from package_scope
  union all
  select * from tenant_scope
) x;

-- =============================================================
-- LANE 2: Internal Operations Tracker
-- =============================================================

-- 2A. ops_work_items
create table if not exists public.ops_work_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id bigint null references public.tenants(id) on delete set null,
  package_instance_id bigint null references public.package_instances(id) on delete set null,
  linked_compliance_task_instance_id uuid null references public.compliance_task_instances(id) on delete set null,
  title text not null,
  description text null,
  status text not null default 'open'
    check (status in ('open','in_progress','blocked','done','cancelled')),
  priority text null,
  due_at timestamptz null,
  owner_user_uuid uuid null references public.users(user_uuid) on delete set null,
  created_by uuid null references public.users(user_uuid) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ops_work_items_owner
on public.ops_work_items (owner_user_uuid, status);

create index if not exists idx_ops_work_items_tenant
on public.ops_work_items (tenant_id, status);

alter table public.ops_work_items enable row level security;

-- Staff can see: tenant-linked items they can access, OR internal-only items (tenant_id is null)
create policy ops_work_staff_select on public.ops_work_items
  for select to authenticated
  using (
    public.is_vivacity_staff(auth.uid())
    and (
      tenant_id is null
      or public.can_access_tenant(auth.uid(), tenant_id)
    )
  );

create policy ops_work_staff_insert on public.ops_work_items
  for insert to authenticated
  with check (
    public.is_vivacity_staff(auth.uid())
    and (
      tenant_id is null
      or public.can_access_tenant(auth.uid(), tenant_id)
    )
  );

create policy ops_work_staff_update on public.ops_work_items
  for update to authenticated
  using (
    public.is_vivacity_staff(auth.uid())
    and (
      tenant_id is null
      or public.can_access_tenant(auth.uid(), tenant_id)
    )
  )
  with check (
    public.is_vivacity_staff(auth.uid())
    and (
      tenant_id is null
      or public.can_access_tenant(auth.uid(), tenant_id)
    )
  );

create policy ops_work_staff_delete on public.ops_work_items
  for delete to authenticated
  using (
    public.is_vivacity_staff(auth.uid())
    and (
      tenant_id is null
      or public.can_access_tenant(auth.uid(), tenant_id)
    )
  );

-- 2B. ops_time_logs
create table if not exists public.ops_time_logs (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.ops_work_items(id) on delete cascade,
  user_uuid uuid not null references public.users(user_uuid) on delete cascade,
  minutes integer not null check (minutes > 0),
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ops_time_logs_work
on public.ops_time_logs (work_item_id, created_at desc);

alter table public.ops_time_logs enable row level security;

create policy ops_time_staff_select on public.ops_time_logs
  for select to authenticated
  using (public.is_vivacity_staff(auth.uid()));

create policy ops_time_staff_insert on public.ops_time_logs
  for insert to authenticated
  with check (public.is_vivacity_staff(auth.uid()));

create policy ops_time_staff_update on public.ops_time_logs
  for update to authenticated
  using (public.is_vivacity_staff(auth.uid()))
  with check (public.is_vivacity_staff(auth.uid()));

create policy ops_time_staff_delete on public.ops_time_logs
  for delete to authenticated
  using (public.is_vivacity_staff(auth.uid()));

-- =============================================================
-- 3. Update attention score to use compliance_task_instances
-- =============================================================

-- Drop and recreate the function (same signature, no cascade needed since view was recreated in Phase 3)
create or replace function public.calculate_attention_score(
  p_stage_score numeric,
  p_gaps_score numeric,
  p_risk_score numeric,
  p_staleness_score numeric,
  p_renewal_score numeric,
  p_burn_score numeric,
  p_task_score numeric default 0
) returns integer
language sql immutable
set search_path = public
as $$
  select round(
    (0.25 * p_stage_score) +
    (0.20 * p_gaps_score) +
    (0.20 * p_risk_score) +
    (0.10 * p_task_score) +
    (0.10 * p_staleness_score) +
    (0.10 * p_renewal_score) +
    (0.05 * p_burn_score)
  )::int;
$$;

-- Recreate attention view pointing to compliance_task_instances
create or replace view public.v_dashboard_attention_ranked
with (security_invoker = true)
as
with base as (
  select
    p.tenant_id, p.tenant_name, p.tenant_status, p.abn, p.rto_id, p.cricos_id,
    p.assigned_csc_user_id, p.packages_json, p.risk_status, p.risk_index,
    p.risk_index_delta_14d, p.worst_stage_health_status, p.critical_stage_count,
    p.at_risk_stage_count, p.open_tasks_count, p.overdue_tasks_count,
    p.mandatory_gaps_count, p.consult_hours_30d, p.burn_risk_status,
    p.projected_exhaustion_date, p.retention_status, p.composite_retention_risk_index,
    p.last_activity_at,
    tcp.renewal_window_start,
    coalesce(hsr.high_severity_open_risks, 0) as high_severity_open_risks,
    coalesce(extract(epoch from now() - p.last_activity_at) / 86400, 999)::integer as days_since_activity,
    case when tcp.renewal_window_start is not null then tcp.renewal_window_start - current_date else null end as days_to_renewal,
    coalesce(cti.compliance_overdue, 0) as compliance_overdue_tasks,
    coalesce(cti.compliance_blocked, 0) as compliance_blocked_tasks,
    coalesce(cti.compliance_open, 0) as compliance_open_tasks
  from v_dashboard_tenant_portfolio p
  left join tenant_commercial_profiles tcp on tcp.tenant_id = p.tenant_id
  left join lateral (
    select count(*)::integer as high_severity_open_risks
    from risk_events re where re.tenant_id = p.tenant_id and re.severity = 'high' and re.status = 'open'
  ) hsr on true
  left join lateral (
    select
      count(*) filter (where t.status not in ('done','n_a') and t.due_at < now())::integer as compliance_overdue,
      count(*) filter (where t.status = 'blocked')::integer as compliance_blocked,
      count(*) filter (where t.status = 'open')::integer as compliance_open
    from compliance_task_instances t where t.tenant_id = p.tenant_id
  ) cti on true
),
sub_scores as (
  select
    b.*,
    least(100, greatest(0,
      case b.worst_stage_health_status when 'critical' then 100 when 'at_risk' then 70 when 'monitoring' then 35 else 0 end
      + least(b.critical_stage_count * 10, 20) + least(b.at_risk_stage_count * 5, 15)
    )) as stage_score,
    case when b.mandatory_gaps_count = 0 then 0 else least(100, b.mandatory_gaps_count * 20) end as gaps_score,
    least(100, greatest(0,
      coalesce(b.risk_index, 0)::numeric + least(25, greatest(0, coalesce(b.risk_index_delta_14d, 0)::numeric * 1.5)) + least(25, b.high_severity_open_risks * 10)::numeric
    ))::integer as risk_score,
    least(100, b.compliance_overdue_tasks * 15 + b.compliance_blocked_tasks * 10 + case when b.compliance_open_tasks > 10 then 20 else 0 end) as task_score,
    least(100,
      case when b.days_since_activity <= 7 then 0 when b.days_since_activity <= 14 then 25 when b.days_since_activity <= 21 then 50 when b.days_since_activity <= 30 then 75 else 100 end
      + case when b.open_tasks_count > 0 and b.days_since_activity >= 15 then 10 else 0 end
    ) as staleness_score,
    case when b.days_to_renewal is null then 0 when b.days_to_renewal <= 0 then 100 when b.days_to_renewal <= 14 then 100 when b.days_to_renewal <= 30 then 75 when b.days_to_renewal <= 60 then 50 when b.days_to_renewal <= 90 then 25 else 0 end as renewal_score,
    least(100,
      case b.burn_risk_status when 'critical' then 100 when 'accelerated' then 50 else 0 end
      + case when b.projected_exhaustion_date is not null and (b.projected_exhaustion_date - current_date) <= 30 then 15 else 0 end
    ) as burn_score
  from base b
),
final as (
  select
    s.*,
    calculate_attention_score(s.stage_score::numeric, s.gaps_score::numeric, s.risk_score::numeric, s.staleness_score::numeric, s.renewal_score::numeric, s.burn_score::numeric, s.task_score::numeric) as attention_score,
    (
      select jsonb_agg(sub.d order by ((sub.d ->> 'impact')::integer) desc)
      from (
        select d.value as d
        from jsonb_array_elements(jsonb_build_array(
          jsonb_build_object('driver','Critical stage','value',(s.critical_stage_count||' critical, '||s.at_risk_stage_count)||' at risk','impact',round(0.25 * s.stage_score::numeric)),
          jsonb_build_object('driver','Mandatory gaps','value',s.mandatory_gaps_count||' missing categories','impact',round(0.20 * s.gaps_score::numeric)),
          jsonb_build_object('driver','Rising risk','value',case when coalesce(s.risk_index_delta_14d,0) > 0 then '+'||s.risk_index_delta_14d||' risk index in 14d' else 'Index '||coalesce(s.risk_index,0) end,'impact',round(0.20 * s.risk_score::numeric)),
          jsonb_build_object('driver','Task pressure','value',s.compliance_overdue_tasks||' overdue, '||s.compliance_blocked_tasks||' blocked','impact',round(0.10 * s.task_score::numeric)),
          jsonb_build_object('driver','Inactivity','value',s.days_since_activity||' days since activity','impact',round(0.10 * s.staleness_score::numeric)),
          jsonb_build_object('driver','Renewal pressure','value',case when s.days_to_renewal is not null then s.days_to_renewal||' days to renewal' else 'No renewal date' end,'impact',round(0.10 * s.renewal_score::numeric)),
          jsonb_build_object('driver','Burn pressure','value',s.burn_risk_status,'impact',round(0.05 * s.burn_score::numeric))
        )) d(value)
        where ((d.value ->> 'impact')::integer) > 0
        limit 3
      ) sub
    ) as attention_drivers_json
  from sub_scores s
)
select
  f.tenant_id, f.tenant_name, f.tenant_status, f.abn, f.rto_id, f.cricos_id,
  f.assigned_csc_user_id, f.packages_json, f.risk_status, f.risk_index,
  f.risk_index_delta_14d, f.worst_stage_health_status, f.critical_stage_count,
  f.at_risk_stage_count, f.open_tasks_count, f.overdue_tasks_count,
  f.mandatory_gaps_count, f.consult_hours_30d, f.burn_risk_status,
  f.projected_exhaustion_date, f.retention_status, f.composite_retention_risk_index,
  f.last_activity_at, f.renewal_window_start, f.high_severity_open_risks,
  f.days_since_activity, f.days_to_renewal,
  f.compliance_overdue_tasks, f.compliance_blocked_tasks, f.compliance_open_tasks,
  f.stage_score, f.gaps_score, f.risk_score, f.task_score,
  f.staleness_score, f.renewal_score, f.burn_score,
  f.attention_score, f.attention_drivers_json
from final f
order by f.attention_score desc, f.critical_stage_count desc, f.mandatory_gaps_count desc,
  f.risk_index_delta_14d desc, f.days_since_activity desc, f.renewal_window_start;
