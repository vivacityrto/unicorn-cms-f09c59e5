-- Backfill with correct type casting
with superhero_ids as (
  select array[29, 16, 3, 22, 39, 13, 5, 24, 40]::bigint[] as ids
),
tenant_stage_data as (
  select distinct
    unnest(t.package_ids) as package_id,
    s.stage_id,
    s.ord as sort_order
  from public.tenants t, superhero_ids si
  cross join lateral (
    select 
      unnest(t.stage_ids) as stage_id,
      generate_subscripts(t.stage_ids, 1) as ord
  ) s
  where t.stage_ids is not null
    and t.package_ids && si.ids
),
superhero_stages as (
  select distinct on (package_id, stage_id)
    package_id,
    stage_id,
    sort_order
  from tenant_stage_data tsd
  where tsd.package_id = any(array[29, 16, 3, 22, 39, 13, 5, 24, 40]::bigint[])
  order by package_id, stage_id, sort_order
)
insert into public.package_stage_map (package_id, stage_id, sort_order, is_required, dashboard_visible)
select
  ss.package_id,
  ss.stage_id,
  ss.sort_order,
  true as is_required,
  coalesce(ds.dashboard_visible, true) as dashboard_visible
from superhero_stages ss
join public.documents_stages ds on ds.id = ss.stage_id
on conflict (package_id, stage_id) do update
set
  sort_order = excluded.sort_order,
  updated_at = now();


-- Seed membership_entitlements from tenants with superhero packages
insert into public.membership_entitlements (
  tenant_id, 
  package_id,
  hours_included_monthly,
  hours_used_current_month,
  month_start_date,
  membership_state,
  membership_started_at
)
select distinct
  t.id as tenant_id,
  pkg.package_id,
  case pkg.package_id
    when 29 then 0
    when 16 then 7
    when 3 then 28
    when 22 then 56
    when 39 then 91
    when 13 then 7
    when 5 then 28
    when 24 then 56
    when 40 then 105
    else 0
  end as hours_included_monthly,
  0 as hours_used_current_month,
  date_trunc('month', current_date)::date as month_start_date,
  'active' as membership_state,
  coalesce(t.created_at, now()) as membership_started_at
from public.tenants t
cross join lateral (
  select unnest(t.package_ids) as package_id
) pkg
where t.package_ids && array[29, 16, 3, 22, 39, 13, 5, 24, 40]::bigint[]
  and pkg.package_id = any(array[29, 16, 3, 22, 39, 13, 5, 24, 40]::bigint[])
on conflict (tenant_id, package_id) do nothing;


-- Backfill client_package_stage_state
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
join public.package_stage_map psm on psm.package_id = me.package_id
on conflict (tenant_id, package_id, stage_id) do nothing;


-- Set initial in_progress stage
with first_stage as (
  select
    cpss.tenant_id,
    cpss.package_id,
    min(cpss.sort_order) as min_sort
  from public.client_package_stage_state cpss
  group by cpss.tenant_id, cpss.package_id
),
pick as (
  select
    cpss.tenant_id,
    cpss.package_id,
    cpss.id as stage_state_id
  from public.client_package_stage_state cpss
  join first_stage fs
    on fs.tenant_id = cpss.tenant_id
   and fs.package_id = cpss.package_id
   and fs.min_sort = cpss.sort_order
)
update public.client_package_stage_state cpss
set
  status = 'in_progress',
  started_at = now(),
  updated_at = now()
from pick
where cpss.id = pick.stage_state_id
  and cpss.status = 'not_started';


-- Update current_stage_state_id
with inprog as (
  select tenant_id, package_id, min(id) as stage_state_id
  from public.client_package_stage_state
  where status = 'in_progress'
  group by tenant_id, package_id
)
update public.membership_entitlements me
set current_stage_state_id = inprog.stage_state_id
from inprog
where me.tenant_id = inprog.tenant_id
  and me.package_id = inprog.package_id;