-- 1) Explicit stage-to-package linking
create table if not exists public.package_stage_map (
  id bigint generated always as identity primary key,
  package_id bigint not null references public.packages(id) on delete cascade,
  stage_id bigint not null references public.documents_stages(id) on delete restrict,
  sort_order int not null default 1,
  is_required boolean not null default true,
  dashboard_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, stage_id)
);

create index if not exists package_stage_map_package_id_idx
  on public.package_stage_map(package_id);

create index if not exists package_stage_map_stage_id_idx
  on public.package_stage_map(stage_id);


-- 2) Deterministic stage state per tenant-package
create table if not exists public.client_package_stage_state (
  id bigint generated always as identity primary key,

  tenant_id bigint not null references public.tenants(id) on delete cascade,
  package_id bigint not null references public.packages(id) on delete cascade,
  stage_id bigint not null references public.documents_stages(id) on delete restrict,

  status text not null default 'not_started'
    check (status in ('not_started','in_progress','blocked','waiting','complete','skipped')),

  is_required boolean not null default true,
  sort_order int not null default 1,

  started_at timestamptz null,
  completed_at timestamptz null,

  blocked_at timestamptz null,
  blocked_reason text null,

  waiting_at timestamptz null,
  waiting_reason text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null,

  unique (tenant_id, package_id, stage_id)
);

create index if not exists cpss_tenant_package_idx
  on public.client_package_stage_state(tenant_id, package_id);

create index if not exists cpss_status_idx
  on public.client_package_stage_state(status);

create index if not exists cpss_stage_idx
  on public.client_package_stage_state(stage_id);


-- 3) Backfill package_stage_map from tenants.stage_ids[] - DEDUPLICATED
with tenant_packages as (
  select
    t.id as tenant_id,
    unnest(
      array_remove(
        array_cat(
          coalesce(t.package_ids, '{}'::bigint[]),
          array[ t.package_id ]::bigint[]
        ),
        null
      )
    ) as package_id,
    t.stage_ids
  from public.tenants t
  where t.stage_ids is not null
),
tenant_stage_orders as (
  select
    tp.package_id,
    s.stage_id,
    s.ord as sort_order
  from tenant_packages tp
  cross join lateral (
    select
      unnest(tp.stage_ids) as stage_id,
      generate_subscripts(tp.stage_ids, 1) as ord
  ) s
),
-- Deduplicate: pick first occurrence per (package_id, stage_id)
deduplicated as (
  select distinct on (package_id, stage_id)
    package_id,
    stage_id,
    sort_order
  from tenant_stage_orders
  order by package_id, stage_id, sort_order
)
insert into public.package_stage_map (package_id, stage_id, sort_order, is_required, dashboard_visible)
select
  d.package_id,
  d.stage_id,
  d.sort_order,
  true as is_required,
  coalesce(ds.dashboard_visible, true) as dashboard_visible
from deduplicated d
join public.documents_stages ds on ds.id = d.stage_id
where d.package_id is not null
on conflict (package_id, stage_id) do update
set
  sort_order = excluded.sort_order,
  dashboard_visible = excluded.dashboard_visible,
  updated_at = now();


-- 4) Backfill client_package_stage_state for each membership_entitlements row
insert into public.client_package_stage_state (
  tenant_id, package_id, stage_id,
  status, is_required, sort_order,
  created_at, updated_at
)
select
  me.tenant_id,
  me.package_id,
  psm.stage_id,
  'not_started'::text as status,
  psm.is_required,
  psm.sort_order,
  now(), now()
from public.membership_entitlements me
join public.package_stage_map psm
  on psm.package_id = me.package_id
on conflict (tenant_id, package_id, stage_id) do nothing;


-- 5) Set initial "in_progress" stage for each tenant-package
with setup_stage as (
  select id from public.documents_stages
  where lower(title) = 'setup client'
  limit 1
),
first_stage as (
  select
    cpss.tenant_id,
    cpss.package_id,
    min(cpss.sort_order) as min_sort
  from public.client_package_stage_state cpss
  group by cpss.tenant_id, cpss.package_id
),
preferred as (
  select
    cpss.tenant_id,
    cpss.package_id,
    cpss.id as stage_state_id
  from public.client_package_stage_state cpss
  join setup_stage ss on cpss.stage_id = ss.id
),
fallback as (
  select
    cpss.tenant_id,
    cpss.package_id,
    cpss.id as stage_state_id
  from public.client_package_stage_state cpss
  join first_stage fs
    on fs.tenant_id = cpss.tenant_id
   and fs.package_id = cpss.package_id
   and fs.min_sort = cpss.sort_order
),
pick as (
  select * from preferred
  union all
  select f.* from fallback f
  where not exists (
    select 1 from preferred p
    where p.tenant_id = f.tenant_id and p.package_id = f.package_id
  )
)
update public.client_package_stage_state cpss
set
  status = 'in_progress',
  started_at = coalesce(cpss.started_at, now()),
  updated_at = now()
from pick
where cpss.id = pick.stage_state_id
  and cpss.status = 'not_started';


-- 6) Add pointer on membership_entitlements to current stage state
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'membership_entitlements'
      and column_name = 'current_stage_state_id'
  ) then
    alter table public.membership_entitlements 
      add column current_stage_state_id bigint references public.client_package_stage_state(id);
  end if;
end $$;

-- Set current_stage_state_id to the in_progress stage
with inprog as (
  select tenant_id, package_id, min(id) as stage_state_id
  from public.client_package_stage_state
  where status = 'in_progress'
  group by tenant_id, package_id
),
lowest as (
  select tenant_id, package_id, min(id) as stage_state_id
  from public.client_package_stage_state
  group by tenant_id, package_id
),
pick as (
  select * from inprog
  union all
  select l.*
  from lowest l
  where not exists (
    select 1 from inprog i
    where i.tenant_id = l.tenant_id and i.package_id = l.package_id
  )
)
update public.membership_entitlements me
set current_stage_state_id = pick.stage_state_id
from pick
where me.tenant_id = pick.tenant_id
  and me.package_id = pick.package_id;


-- 7) RLS Policies for package_stage_map
alter table public.package_stage_map enable row level security;

drop policy if exists "Authenticated users can read package_stage_map" on public.package_stage_map;
create policy "Authenticated users can read package_stage_map"
  on public.package_stage_map for select
  to authenticated
  using (true);


-- 8) RLS Policies for client_package_stage_state
alter table public.client_package_stage_state enable row level security;

drop policy if exists "Users can read stage state for their tenants" on public.client_package_stage_state;
create policy "Users can read stage state for their tenants"
  on public.client_package_stage_state for select
  to authenticated
  using (
    tenant_id in (
      select tenant_id from public.users where user_uuid = auth.uid()
    )
  );

drop policy if exists "Users can update stage state for their tenants" on public.client_package_stage_state;
create policy "Users can update stage state for their tenants"
  on public.client_package_stage_state for update
  to authenticated
  using (
    tenant_id in (
      select tenant_id from public.users where user_uuid = auth.uid()
    )
  );


-- 9) Stage state audit log table
create table if not exists public.stage_state_audit_log (
  id bigint generated always as identity primary key,
  stage_state_id bigint not null references public.client_package_stage_state(id) on delete cascade,
  old_status text,
  new_status text not null,
  reason text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists stage_audit_stage_state_idx
  on public.stage_state_audit_log(stage_state_id);

alter table public.stage_state_audit_log enable row level security;

drop policy if exists "Users can read audit logs for their tenants" on public.stage_state_audit_log;
create policy "Users can read audit logs for their tenants"
  on public.stage_state_audit_log for select
  to authenticated
  using (
    stage_state_id in (
      select cpss.id from public.client_package_stage_state cpss
      where cpss.tenant_id in (
        select tenant_id from public.users where user_uuid = auth.uid()
      )
    )
  );

drop policy if exists "Users can insert audit logs for their tenants" on public.stage_state_audit_log;
create policy "Users can insert audit logs for their tenants"
  on public.stage_state_audit_log for insert
  to authenticated
  with check (
    stage_state_id in (
      select cpss.id from public.client_package_stage_state cpss
      where cpss.tenant_id in (
        select tenant_id from public.users where user_uuid = auth.uid()
      )
    )
  );


-- 10) Transition stage state function
create or replace function public.transition_stage_state(
  p_stage_state_id bigint,
  p_new_status text,
  p_reason text default null,
  p_user_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text;
  v_is_required boolean;
  v_stage_state public.client_package_stage_state%rowtype;
begin
  -- Get current state
  select * into v_stage_state
  from public.client_package_stage_state
  where id = p_stage_state_id;

  if not found then
    return json_build_object('success', false, 'error', 'Stage state not found');
  end if;

  v_old_status := v_stage_state.status;
  v_is_required := v_stage_state.is_required;

  -- Validate: can't skip required stages
  if p_new_status = 'skipped' and v_is_required then
    return json_build_object('success', false, 'error', 'Cannot skip required stage');
  end if;

  -- Validate: blocked/waiting require reason
  if p_new_status in ('blocked', 'waiting') and (p_reason is null or p_reason = '') then
    return json_build_object('success', false, 'error', 'Reason required for blocked/waiting status');
  end if;

  -- Update stage state
  update public.client_package_stage_state
  set
    status = p_new_status,
    started_at = case 
      when p_new_status = 'in_progress' and started_at is null then now()
      else started_at
    end,
    completed_at = case 
      when p_new_status in ('complete', 'skipped') then now()
      else null
    end,
    blocked_at = case 
      when p_new_status = 'blocked' then now()
      else null
    end,
    blocked_reason = case 
      when p_new_status = 'blocked' then p_reason
      else null
    end,
    waiting_at = case 
      when p_new_status = 'waiting' then now()
      else null
    end,
    waiting_reason = case 
      when p_new_status = 'waiting' then p_reason
      else null
    end,
    updated_at = now(),
    updated_by = coalesce(p_user_id, auth.uid())
  where id = p_stage_state_id;

  -- Log the transition
  insert into public.stage_state_audit_log (stage_state_id, old_status, new_status, reason, changed_by)
  values (p_stage_state_id, v_old_status, p_new_status, p_reason, coalesce(p_user_id, auth.uid()));

  -- If transitioning to complete, auto-advance to next stage
  if p_new_status = 'complete' then
    update public.client_package_stage_state
    set 
      status = 'in_progress',
      started_at = now(),
      updated_at = now()
    where tenant_id = v_stage_state.tenant_id
      and package_id = v_stage_state.package_id
      and sort_order = v_stage_state.sort_order + 1
      and status = 'not_started';

    -- Update current_stage_state_id on membership_entitlements
    update public.membership_entitlements
    set current_stage_state_id = (
      select id from public.client_package_stage_state
      where tenant_id = v_stage_state.tenant_id
        and package_id = v_stage_state.package_id
        and status = 'in_progress'
      order by sort_order
      limit 1
    )
    where tenant_id = v_stage_state.tenant_id
      and package_id = v_stage_state.package_id;
  end if;

  return json_build_object('success', true, 'old_status', v_old_status, 'new_status', p_new_status);
end;
$$;