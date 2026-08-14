-- Splits "available to all clients" (pure browse/visibility) from mass
-- auto-enrollment. The prior trigger (fn_academy_autoenrol_on_all_clients_publish,
-- not present in any migration in this repo — it was applied directly against
-- the hosted project, not via a tracked migration) auto-enrolled every active
-- user platform-wide whenever a course was published with
-- available_to_all_clients = true, with no regard for whether the user's
-- tenant had Academy access at all. That's wrong on two counts: it conflates
-- "clients can see/browse this" with "clients are enrolled" (self-enrol
-- already exists as the deliberate-intent pathway via enrol_in_academy_course),
-- and it ignores tenants.academy_access_enabled entirely.
--
-- This introduces a separate, explicit, off-by-default toggle
-- (auto_enrol_all_clients) for the genuinely-mandatory case, and scopes it to
-- only tenants with Academy access enabled and an unexpired subscription.
-- available_to_all_clients is untouched — it keeps its current
-- browse/visibility-only meaning.

-- 1) New course-level toggle, off by default for every existing course too —
-- nothing auto-enrolls anyone until a course author explicitly opts in.
ALTER TABLE public.academy_courses
  ADD COLUMN IF NOT EXISTS auto_enrol_all_clients boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.academy_courses.auto_enrol_all_clients IS
  'Explicit, off-by-default toggle for mandatory platform-wide auto-enrollment on publish. Distinct from available_to_all_clients (browse/visibility only). Scoped at enrollment time to tenants with academy_access_enabled = true and an unexpired academy_subscription_expires_at.';

-- 2) Retire the old trigger/function — it auto-enrolled off
-- available_to_all_clients with no tenant-entitlement check.
DROP TRIGGER IF EXISTS trg_academy_autoenrol_on_all_clients_publish ON public.academy_courses;
DROP FUNCTION IF EXISTS public.fn_academy_autoenrol_on_all_clients_publish();

-- 3) New trigger: fires only on the new toggle, only enrolls users at
-- tenants with real Academy entitlement.
CREATE OR REPLACE FUNCTION public.fn_academy_autoenrol_on_mandatory_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if NEW.status = 'published'
     and NEW.auto_enrol_all_clients = true
     and (
       TG_OP = 'INSERT'
       or OLD.status is distinct from NEW.status
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

DROP TRIGGER IF EXISTS trg_academy_autoenrol_on_mandatory_publish ON public.academy_courses;
CREATE TRIGGER trg_academy_autoenrol_on_mandatory_publish
  AFTER INSERT OR UPDATE ON public.academy_courses
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_academy_autoenrol_on_mandatory_publish();

-- 4) Trigger-only SECURITY DEFINER function — revoke direct execute, matching
-- every other trigger-only function in this schema.
REVOKE EXECUTE ON FUNCTION public.fn_academy_autoenrol_on_mandatory_publish() FROM anon, authenticated, PUBLIC;
