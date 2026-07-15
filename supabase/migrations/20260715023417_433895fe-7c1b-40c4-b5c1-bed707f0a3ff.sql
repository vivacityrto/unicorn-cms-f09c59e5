
-- Restrict client updates on client_audit_actions to response-only fields.
-- Vivacity staff can still edit everything (client_audit_actions_staff_all).
CREATE OR REPLACE FUNCTION public.guard_client_audit_actions_client_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Staff bypass: if caller is Vivacity staff, allow anything.
  IF public.is_vivacity_team_safe(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- For tenant (client) users, forbid changes to internal-only fields.
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.internal_notes IS DISTINCT FROM OLD.internal_notes
     OR NEW.extension_approved_by IS DISTINCT FROM OLD.extension_approved_by
     OR NEW.extension_approved_at IS DISTINCT FROM OLD.extension_approved_at
     OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.audit_id IS DISTINCT FROM OLD.audit_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
  THEN
    RAISE EXCEPTION 'Clients may only update their own response fields on client_audit_actions'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_client_audit_actions_client_update() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_client_audit_actions_client_update() TO authenticated;

DROP TRIGGER IF EXISTS trg_guard_client_audit_actions_client_update ON public.client_audit_actions;
CREATE TRIGGER trg_guard_client_audit_actions_client_update
BEFORE UPDATE ON public.client_audit_actions
FOR EACH ROW
EXECUTE FUNCTION public.guard_client_audit_actions_client_update();

NOTIFY pgrst, 'reload schema';
