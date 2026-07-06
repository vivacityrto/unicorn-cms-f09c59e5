-- M1: Extend sync_tenant_lifecycle_status() to maintain tenants.churned_at
-- and auto-close the open tenant_csc_assignments stint on active->non-active.
--
-- Rollback: CREATE OR REPLACE FUNCTION with the prior body below.
--
-- Prior function body (captured via pg_get_functiondef, 2026-07-06):
-- ----------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.sync_tenant_lifecycle_status()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SET search_path TO 'public'
-- AS $function$
-- BEGIN
--   IF NEW.status IS DISTINCT FROM OLD.status THEN
--     NEW.lifecycle_status := CASE
--       WHEN NEW.status = 'active' THEN 'active'
--       WHEN NEW.status IN ('disabled', 'on_hold', 'overrun', 'In Arears') THEN 'suspended'
--       WHEN NEW.status IN ('terminated', 'cancelled') THEN 'closed'
--       ELSE NEW.lifecycle_status
--     END;
--   END IF;
--   RETURN NEW;
-- END;
-- $function$
-- ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_tenant_lifecycle_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_lifecycle text := OLD.lifecycle_status;
  v_new_lifecycle text;
BEGIN
  -- 1. Preserve existing behaviour: derive lifecycle_status from status changes.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.lifecycle_status := CASE
      WHEN NEW.status = 'active' THEN 'active'
      WHEN NEW.status IN ('disabled', 'on_hold', 'overrun', 'In Arears') THEN 'suspended'
      WHEN NEW.status IN ('terminated', 'cancelled') THEN 'closed'
      ELSE NEW.lifecycle_status
    END;
  END IF;

  v_new_lifecycle := NEW.lifecycle_status;

  -- 2. Maintain churned_at based on lifecycle_status transitions.
  IF v_old_lifecycle IS DISTINCT FROM v_new_lifecycle THEN
    IF v_old_lifecycle = 'active'
       AND v_new_lifecycle IN ('suspended', 'closed', 'archived') THEN
      NEW.churned_at := now();
    ELSIF v_old_lifecycle IN ('suspended', 'closed', 'archived')
          AND v_new_lifecycle = 'active' THEN
      NEW.churned_at := NULL;
    END IF;
  END IF;

  -- 3. If churned_at was just set (non-NULL and changed), close the currently
  --    open tenant_csc_assignments stint for this tenant with the same timestamp.
  --    Reactivation (churned_at -> NULL) intentionally does NOT reopen ended_at.
  IF NEW.churned_at IS DISTINCT FROM OLD.churned_at
     AND NEW.churned_at IS NOT NULL THEN
    UPDATE public.tenant_csc_assignments
       SET ended_at = NEW.churned_at
     WHERE tenant_id = NEW.id
       AND superseded_at IS NULL
       AND ended_at IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_tenant_lifecycle_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_tenant_lifecycle_status() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';