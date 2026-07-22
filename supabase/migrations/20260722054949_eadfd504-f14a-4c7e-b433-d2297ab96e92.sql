-- Enforce that only a Super Admin may create or change an invitation that
-- carries an internal Vivacity unicorn_role.
--
-- Originally authored 18 Jul 2026 as 20260718065738_enforce_invitation_role_ceiling.sql
-- but never reached the live DB; reissued under today's timestamp and the old
-- file removed in the same commit.
--
-- Closes a direct PostgREST bypass: user_invitations_manage_tenant_admin RLS
-- lets tenant admins INSERT/UPDATE for their tenant, and the CHECK constraint
-- allows internal roles. Without this trigger a tenant Admin could write
-- unicorn_role = 'Super Admin' (etc.) via direct REST.
--
-- Canonical internal-staff role list: src/lib/roles/vivacityRoles.ts
-- (Super Admin, Team Leader, Team Member, Integrator, BGT, CSC, CET).
--
-- Safety notes:
--   * service_role bypass — every writer edge function uses the SERVICE_ROLE_KEY,
--     so PostgREST sets request.jwt.claim.role = 'service_role' and the
--     short-circuit fires.
--   * UPDATE only re-checks when unicorn_role actually changes — accept-flow
--     status transitions, expiry auto-flip, and delivery backfills pass through.

CREATE OR REPLACE FUNCTION public.enforce_invitation_role_ceiling()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.unicorn_role IS NOT DISTINCT FROM OLD.unicorn_role
  THEN
    RETURN NEW;
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
     AND NOT public.is_super_admin_safe((SELECT auth.uid()))
  THEN
    RAISE EXCEPTION
      'Only a Super Admin may create or edit an invitation carrying an internal Unicorn role.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_invitation_role_ceiling() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_invitation_role_ceiling() FROM authenticated, service_role;

DROP TRIGGER IF EXISTS trg_enforce_invitation_role_ceiling ON public.user_invitations;
CREATE TRIGGER trg_enforce_invitation_role_ceiling
  BEFORE INSERT OR UPDATE ON public.user_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invitation_role_ceiling();

NOTIFY pgrst, 'reload schema';