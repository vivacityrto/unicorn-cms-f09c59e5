-- Migration 1/5: Audit trigger for public.tenant_users -> public.audit_user_events
-- Hardened: SECURITY DEFINER + SET search_path = '' + fully-qualified references.
-- Coexists with existing BEFORE triggers trg_sync_primary_contact, trg_sync_secondary_contact.

CREATE OR REPLACE FUNCTION public.fn_audit_tenant_users()
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
    v_action := 'tenant_membership_created';
    v_target := NEW.user_id;
    v_actor  := COALESCE(auth.uid(), NEW.created_by);
    v_tenant := NEW.tenant_id;
    v_new := jsonb_build_object(
      'role', NEW.role,
      'access_scope', NEW.access_scope,
      'relationship_role', NEW.relationship_role,
      'primary_contact', NEW.primary_contact,
      'secondary_contact', NEW.secondary_contact
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'tenant_membership_updated';
    v_target := COALESCE(NEW.user_id, OLD.user_id);
    v_actor  := COALESCE(auth.uid(), NEW.created_by, OLD.created_by);
    v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_old := jsonb_build_object(
      'role', OLD.role,
      'access_scope', OLD.access_scope,
      'relationship_role', OLD.relationship_role,
      'primary_contact', OLD.primary_contact,
      'secondary_contact', OLD.secondary_contact
    );
    v_new := jsonb_build_object(
      'role', NEW.role,
      'access_scope', NEW.access_scope,
      'relationship_role', NEW.relationship_role,
      'primary_contact', NEW.primary_contact,
      'secondary_contact', NEW.secondary_contact
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'tenant_membership_deleted';
    v_target := OLD.user_id;
    v_actor  := COALESCE(auth.uid(), OLD.created_by);
    v_tenant := OLD.tenant_id;
    v_old := jsonb_build_object(
      'role', OLD.role,
      'access_scope', OLD.access_scope,
      'relationship_role', OLD.relationship_role,
      'primary_contact', OLD.primary_contact,
      'secondary_contact', OLD.secondary_contact
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

GRANT EXECUTE ON FUNCTION public.fn_audit_tenant_users() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_audit_tenant_users ON public.tenant_users;

CREATE TRIGGER trg_audit_tenant_users
AFTER INSERT OR UPDATE OR DELETE ON public.tenant_users
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_tenant_users();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_audit_tenant_users ON public.tenant_users;
-- DROP FUNCTION IF EXISTS public.fn_audit_tenant_users();