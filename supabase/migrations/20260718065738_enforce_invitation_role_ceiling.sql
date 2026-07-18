-- Enforce that only a Super Admin may create or change an invitation that
-- carries an internal Vivacity unicorn_role.
--
-- Closes a direct PostgREST bypass: RLS currently lets tenant admins INSERT/
-- UPDATE user_invitations for their tenant, and the CHECK constraint allows
-- internal roles. Without this trigger a non-SA authenticated client could
-- write unicorn_role = 'Super Admin' (etc.) onto an invitation row.
--
-- Canonical internal-staff role list: src/lib/roles/vivacityRoles.ts
-- (Super Admin, Team Leader, Team Member, Integrator, BGT, CSC, CET).
--
-- Safety notes:
--   * service_role bypass — invite-user / bulk-send edge functions insert via
--     the service role (auth.uid() is null); they enforce caller permissions
--     in application code.
--   * UPDATE only re-checks when unicorn_role actually changes — so
--     accept_invitation_v2 status transitions (and similar) are unaffected.

CREATE OR REPLACE FUNCTION public.enforce_invitation_role_ceiling()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Edge functions / service-role writers manage their own authz.
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Status / metadata updates that leave unicorn_role alone are fine.
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

DROP TRIGGER IF EXISTS trg_enforce_invitation_role_ceiling ON public.user_invitations;
CREATE TRIGGER trg_enforce_invitation_role_ceiling
  BEFORE INSERT OR UPDATE ON public.user_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invitation_role_ceiling();

NOTIFY pgrst, 'reload schema';
