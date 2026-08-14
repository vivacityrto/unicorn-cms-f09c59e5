-- Bugbot finding on PR #278: turning off available_to_all_clients hid the
-- auto-enrol toggle in the UI but left auto_enrol_all_clients set in the DB,
-- and fn_academy_autoenrol_on_mandatory_publish never checked the browse
-- flag — so a later republish could still mass-enrol clients into a course
-- they can no longer browse. Require both flags at fire time instead of
-- relying on UI nesting alone.

CREATE OR REPLACE FUNCTION public.fn_academy_autoenrol_on_mandatory_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
      u.user_uuid,
      u.tenant_id,
      'active',
      'auto_all_clients',
      now(),
      'Auto-enrolled: course marked mandatory for all eligible clients on publish'
    from public.users u
    join public.tenants t on t.id = u.tenant_id
    join auth.users au on au.id = u.user_uuid
    where u.archived = false
      and u.disabled = false
      and u.tenant_id is not null
      and t.academy_access_enabled = true
      and (t.academy_subscription_expires_at is null or t.academy_subscription_expires_at > now())
    on conflict (course_id, user_id) do nothing;
  end if;

  return NEW;
end;
$function$;
