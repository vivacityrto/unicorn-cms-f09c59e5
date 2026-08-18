-- Close the service_role bypass in trg_enforce_invitation_role_ceiling.
--
-- The trigger unconditionally exempted any insert/update where the
-- connecting Postgres role authenticated as service_role, on the theory
-- that "trusted internal callers" don't need the ceiling. But every
-- supabase/functions/** edge function connects to Postgres as service_role,
-- so this exempted 100% of edge-function-originated writes to
-- user_invitations -- including invite-user and activate-ghost-user, which
-- are the only two paths that can actually insert an internal
-- (Super Admin / Team Leader / Team Member / Integrator / BGT / CSC / CET)
-- unicorn_role. The app-layer admin.team_users.manage checks in those
-- functions were therefore the ONLY defense, not defense-in-depth as the
-- trigger's own name implies.
--
-- Fix: when the connecting role is service_role, use NEW.invited_by as the
-- acting-user identity instead of exempting the write outright.
-- invite-to-tenant, invite-user, and activate-ghost-user (the only current
-- INSERT paths) all independently verify the caller's JWT via
-- supabase.auth.getUser(token) and stamp the resulting user id onto
-- invited_by before inserting -- so invited_by is a trustworthy proxy for
-- "who the edge function's own auth check resolved", not caller-suppliable
-- data. UPDATE paths that leave unicorn_role unchanged already short-circuit
-- above and are unaffected (resend-invite, cancel-invite, accept_invitation_v2
-- never modify unicorn_role).
--
-- Deliberately checks is_super_admin_safe() (strict unicorn_role = 'Super
-- Admin' / global_role = 'SuperAdmin') rather than re-running
-- check_permission('admin.team_users.manage'): role_permissions is an
-- editable table, and this trigger's job is to hold the ceiling even if
-- that table is ever misconfigured to grant the feature more broadly.
-- Confirmed current role_permissions grants 'admin.team_users.manage' at
-- 'full' only to Super Admin, so this is not a behavior change today --
-- it only closes the service_role gap.
CREATE OR REPLACE FUNCTION public.enforce_invitation_role_ceiling()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_acting_user uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.unicorn_role IS NOT DISTINCT FROM OLD.unicorn_role
  THEN
    RETURN NEW;
  END IF;

  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    v_acting_user := NEW.invited_by;
  ELSE
    v_acting_user := (SELECT auth.uid());
  END IF;

  IF NEW.unicorn_role IS NOT NULL
     AND NEW.unicorn_role IN (
       'Super Admin',
       'Team Leader',
       'Team Member',
       'Integrator',
       'BGT',
       'CSC',
       'CET'
     )
     AND NOT public.is_super_admin_safe(v_acting_user)
  THEN
    RAISE EXCEPTION
      'Only a Super Admin may create or edit an invitation carrying an internal Unicorn role.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
