-- Two parked follow-ups from the 2026-08-14 mass-autoenrol fix:
--
-- 1. fn_academy_autoenrol_on_package_instance had the exact same gap the
--    all-clients trigger did: no check against tenants.academy_access_enabled
--    or academy_subscription_expires_at. Unlike the all-clients bug, this
--    hasn't caused real harm yet (0 of its 448 auto_package enrolments sit on
--    a disentitled tenant today), but it's the same latent hole and gets the
--    same fix rather than waiting for an incident.
--
-- 2. Neither auto-enrol trigger respected tenants.academy_max_users — the
--    seat cap already shown on the Academy Tenant Access admin page
--    side-by-side with "Enrolled" (see AcademyTenantAccessPage.tsx /
--    useTenantAcademyAccess.ts's TenantRow.enrolled_count), but never
--    actually enforced anywhere. Both triggers now cap new rows per tenant so
--    a bulk auto-enrol can never push a tenant's active enrolment count past
--    its academy_max_users (null = unlimited, unchanged). Enforcement is
--    against the same metric the admin page already displays (active
--    enrolment row count), not distinct users, so it stays consistent with
--    what's already shown there.
--
-- Scope note: self-enrol (enrol_in_academy_course / enrol_as_impersonator)
-- checks neither academy_access_enabled, subscription expiry, nor
-- academy_max_users either — a real, separate gap found while investigating
-- this, deliberately left untouched here (flagged in the audit entry).

create or replace function public.fn_academy_autoenrol_on_mandatory_publish()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if NEW.status = 'published'
     and NEW.available_to_all_clients = true
     and NEW.auto_enrol_all_clients = true
     and (
       TG_OP = 'INSERT'
       or OLD.status is distinct from NEW.status
       or OLD.available_to_all_clients is distinct from NEW.available_to_all_clients
       or OLD.auto_enrol_all_clients is distinct from NEW.auto_enrol_all_clients
     )
  then
    insert into public.academy_enrollments (
      course_id, user_id, tenant_id, status, source, enrolled_at, notes
    )
    select
      NEW.id,
      eligible.user_uuid,
      eligible.tenant_id,
      'active',
      'auto_all_clients',
      now(),
      'Auto-enrolled: course marked mandatory for all eligible clients on publish'
    from (
      select
        u.user_uuid,
        u.tenant_id,
        t.academy_max_users,
        (
          select count(*) from public.academy_enrollments e
          where e.tenant_id = u.tenant_id and e.status = 'active'
        ) as current_active,
        row_number() over (partition by u.tenant_id order by u.user_uuid) as rn
      from public.users u
      join public.tenants t on t.id = u.tenant_id
      join auth.users au on au.id = u.user_uuid
      where u.archived = false
        and u.disabled = false
        and u.tenant_id is not null
        and t.academy_access_enabled = true
        and (t.academy_subscription_expires_at is null or t.academy_subscription_expires_at > now())
    ) eligible
    where eligible.academy_max_users is null
       or (eligible.current_active + eligible.rn) <= eligible.academy_max_users
    on conflict (course_id, user_id) do nothing;
  end if;

  return NEW;
end;
$function$;

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

  insert into public.academy_enrollments (
    course_id, user_id, tenant_id, status, source, enrolled_at, notes
  )
  select
    eligible.course_id,
    eligible.user_id,
    NEW.tenant_id,
    'active',
    'auto_package',
    now(),
    'Auto-enrolled via package_instance ' || NEW.id::text
  from (
    select
      r.course_id,
      tu.user_id,
      t.academy_max_users,
      (
        select count(*) from public.academy_enrollments e
        where e.tenant_id = NEW.tenant_id and e.status = 'active'
      ) as current_active,
      row_number() over (order by r.course_id, tu.user_id) as rn
    from public.academy_package_course_rules r
    join public.tenant_users tu on tu.tenant_id = NEW.tenant_id
    join public.academy_courses c on c.id = r.course_id
    join public.tenants t on t.id = NEW.tenant_id
    where r.package_id = NEW.package_id
      and r.is_active = true
      and c.status = 'published'
      and t.academy_access_enabled = true
      and (t.academy_subscription_expires_at is null or t.academy_subscription_expires_at > now())
  ) eligible
  where eligible.academy_max_users is null
     or (eligible.current_active + eligible.rn) <= eligible.academy_max_users
  on conflict (course_id, user_id) do nothing;

  return NEW;
end;
$function$;
