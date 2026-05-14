-- Migration 2/5: Audit triggers for public.users -> public.audit_user_events
-- Three triggers (INSERT, UPDATE w/ WHEN, DELETE) share one function.
-- Hardened: SECURITY DEFINER + SET search_path = '' + fully-qualified references.

CREATE OR REPLACE FUNCTION public.fn_audit_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_action text;
  v_target uuid;
  v_actor  uuid;
  v_tenant bigint;
  v_old    jsonb;
  v_new    jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'user_profile_created';
    v_target := NEW.user_uuid;
    v_actor  := auth.uid();
    v_tenant := NEW.tenant_id;
    v_new := jsonb_build_object(
      'first_name', NEW.first_name,
      'last_name', NEW.last_name,
      'email', NEW.email,
      'global_role', NEW.global_role,
      'unicorn_role', NEW.unicorn_role,
      'superadmin_level', NEW.superadmin_level,
      'archived', NEW.archived,
      'disabled', NEW.disabled,
      'tenant_id', NEW.tenant_id,
      'is_csc', NEW.is_csc,
      'is_vivacity_internal', NEW.is_vivacity_internal
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'user_profile_updated';
    v_target := COALESCE(NEW.user_uuid, OLD.user_uuid);
    v_actor  := auth.uid();
    v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_old := jsonb_build_object(
      'first_name', OLD.first_name,
      'last_name', OLD.last_name,
      'email', OLD.email,
      'global_role', OLD.global_role,
      'unicorn_role', OLD.unicorn_role,
      'superadmin_level', OLD.superadmin_level,
      'archived', OLD.archived,
      'disabled', OLD.disabled,
      'tenant_id', OLD.tenant_id,
      'is_csc', OLD.is_csc,
      'is_vivacity_internal', OLD.is_vivacity_internal
    );
    v_new := jsonb_build_object(
      'first_name', NEW.first_name,
      'last_name', NEW.last_name,
      'email', NEW.email,
      'global_role', NEW.global_role,
      'unicorn_role', NEW.unicorn_role,
      'superadmin_level', NEW.superadmin_level,
      'archived', NEW.archived,
      'disabled', NEW.disabled,
      'tenant_id', NEW.tenant_id,
      'is_csc', NEW.is_csc,
      'is_vivacity_internal', NEW.is_vivacity_internal
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'user_profile_deleted';
    v_target := OLD.user_uuid;
    v_actor  := auth.uid();
    v_tenant := OLD.tenant_id;
    v_old := jsonb_build_object(
      'first_name', OLD.first_name,
      'last_name', OLD.last_name,
      'email', OLD.email,
      'global_role', OLD.global_role,
      'unicorn_role', OLD.unicorn_role,
      'superadmin_level', OLD.superadmin_level,
      'archived', OLD.archived,
      'disabled', OLD.disabled,
      'tenant_id', OLD.tenant_id,
      'is_csc', OLD.is_csc,
      'is_vivacity_internal', OLD.is_vivacity_internal
    );
  END IF;

  INSERT INTO public.audit_user_events (
    actor_user_uuid, target_user_uuid, action, tenant_id, details
  ) VALUES (
    v_actor,
    v_target,
    v_action,
    v_tenant,
    jsonb_strip_nulls(jsonb_build_object('old', v_old, 'new', v_new))
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_audit_users() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_audit_users_insert ON public.users;
DROP TRIGGER IF EXISTS trg_audit_users_update ON public.users;
DROP TRIGGER IF EXISTS trg_audit_users_delete ON public.users;

CREATE TRIGGER trg_audit_users_insert
AFTER INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_users();

CREATE TRIGGER trg_audit_users_update
AFTER UPDATE ON public.users
FOR EACH ROW
WHEN (
  OLD.first_name IS DISTINCT FROM NEW.first_name
  OR OLD.last_name IS DISTINCT FROM NEW.last_name
  OR OLD.email IS DISTINCT FROM NEW.email
  OR OLD.global_role IS DISTINCT FROM NEW.global_role
  OR OLD.unicorn_role IS DISTINCT FROM NEW.unicorn_role
  OR OLD.superadmin_level IS DISTINCT FROM NEW.superadmin_level
  OR OLD.archived IS DISTINCT FROM NEW.archived
  OR OLD.disabled IS DISTINCT FROM NEW.disabled
  OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
  OR OLD.is_csc IS DISTINCT FROM NEW.is_csc
  OR OLD.is_vivacity_internal IS DISTINCT FROM NEW.is_vivacity_internal
)
EXECUTE FUNCTION public.fn_audit_users();

CREATE TRIGGER trg_audit_users_delete
AFTER DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_users();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_audit_users_insert ON public.users;
-- DROP TRIGGER IF EXISTS trg_audit_users_update ON public.users;
-- DROP TRIGGER IF EXISTS trg_audit_users_delete ON public.users;
-- DROP FUNCTION IF EXISTS public.fn_audit_users();