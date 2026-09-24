-- Change package-based Academy auto-enrol from creating a premature real
-- academy_enrollments row (status='active') for every tenant user, to
-- granting a tenant-level "entitlement" — the course becomes visible/
-- eligible in the catalog, but the real enrolment (and analytics clock)
-- only starts when the learner clicks "Start Course" themselves via the
-- existing enrol_in_academy_course RPC (unchanged).
--
-- Scope: only fn_academy_autoenrol_on_package_instance and
-- fn_academy_backfill_enrollments_for_rule. The separate "mandatory for all
-- clients" trigger (fn_academy_autoenrol_on_mandatory_publish) is
-- deliberately untouched — real compliance-mandatory assignment, not a
-- package-convenience mapping.

-- 1. New tenant-level entitlement table.
create table public.academy_tenant_course_entitlements (
  id bigint generated always as identity primary key,
  tenant_id bigint not null references public.tenants(id),
  course_id bigint not null references public.academy_courses(id),
  package_id bigint references public.packages(id),
  granted_at timestamptz not null default now(),
  unique (tenant_id, course_id)
);

alter table public.academy_tenant_course_entitlements enable row level security;

create policy "Entitlements: Vivacity staff manage all"
  on public.academy_tenant_course_entitlements
  as permissive for all to public
  using (
    exists (
      select 1 from public.users u
      where u.user_uuid = auth.uid()
        and (lower(u.global_role) in ('superadmin','admin')
             or u.is_vivacity_internal = true)
    )
  );

create policy "Entitlements: tenant members view own tenant"
  on public.academy_tenant_course_entitlements
  as permissive for select to authenticated
  using (
    exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.tenant_id = academy_tenant_course_entitlements.tenant_id
    )
  );

-- 2. Rewrite the package-based auto-enrol trigger: tenant-level entitlement
-- insert, no per-user loop, no seat-cap subquery (entitlement isn't a seat).
create or replace function public.fn_academy_autoenrol_on_package_instance()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(NEW.is_active, true) is not true then
    return NEW;
  end if;
  if coalesce(NEW.membership_state, 'active') <> 'active' then
    return NEW;
  end if;

  insert into public.academy_tenant_course_entitlements (
    tenant_id, course_id, package_id
  )
  select NEW.tenant_id, r.course_id, r.package_id
  from public.academy_package_course_rules r
  join public.academy_courses c on c.id = r.course_id
  where r.package_id = NEW.package_id
    and r.is_active = true
    and c.status = 'published'
  on conflict (tenant_id, course_id) do nothing;

  return NEW;
end;
$function$;

-- 3. Rewrite the retroactive backfill RPC the same way: grants entitlements
-- to already-existing package holders, instead of inserting real enrolments.
create or replace function public.fn_academy_backfill_enrollments_for_rule(p_rule_id bigint)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rule       public.academy_package_course_rules%ROWTYPE;
  v_course     public.academy_courses%ROWTYPE;
  v_new_count  integer;
  v_is_staff   boolean;
begin
  select exists (
    select 1 from public.users u
    where u.user_uuid = auth.uid()
      and (
        u.global_role = any (array['superadmin','admin'])
        or u.is_vivacity_internal = true
      )
  ) into v_is_staff;

  if not v_is_staff then
    raise exception 'Access denied: Vivacity staff only';
  end if;

  select * into v_rule
  from public.academy_package_course_rules
  where id = p_rule_id and is_active = true;

  if not found then
    raise exception 'Rule % not found or inactive', p_rule_id;
  end if;

  select * into v_course
  from public.academy_courses
  where id = v_rule.course_id;

  if not found or v_course.status <> 'published' then
    raise exception 'Course % not found or not published', v_rule.course_id;
  end if;

  with inserted as (
    insert into public.academy_tenant_course_entitlements (
      tenant_id, course_id, package_id
    )
    select distinct pi.tenant_id, v_rule.course_id, v_rule.package_id
    from public.package_instances pi
    where pi.package_id       = v_rule.package_id
      and pi.is_active        = true
      and pi.membership_state = 'active'
    on conflict (tenant_id, course_id) do nothing
    returning 1
  )
  select count(*)::integer into v_new_count from inserted;

  return v_new_count;
end;
$function$;

-- 4. New safe catalog RPC: adds package-entitlement-based visibility on top
-- of the existing audience-tag match, without narrowing any existing grant
-- (mirrors the get_academy_course_lesson_outline_safe pattern from the
-- 2026-08-28 fix). Replaces the raw academy_courses query in
-- src/hooks/useAcademyCourses.ts.
create or replace function public.get_academy_catalog_courses(p_audience_key text)
returns setof public.academy_courses
language sql
stable
security definer
set search_path to ''
as $function$
  select c.*
  from public.academy_courses c
  where c.status = 'published'
    and public.has_academy_access_safe(auth.uid())
    and (
      c.target_audience @> array[p_audience_key]
      or exists (
        select 1
        from public.academy_tenant_course_entitlements ent
        join public.tenant_users tu on tu.tenant_id = ent.tenant_id
        where tu.user_id = auth.uid()
          and ent.course_id = c.id
      )
    )
  order by c.sort_order nulls last, c.title;
$function$;

revoke execute on function public.get_academy_catalog_courses(text) from public;
revoke execute on function public.get_academy_catalog_courses(text) from anon;
grant execute on function public.get_academy_catalog_courses(text) to authenticated;
