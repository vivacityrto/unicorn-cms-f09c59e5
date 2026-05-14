CREATE OR REPLACE FUNCTION public.fn_audit_tenant_users_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_user_events (
    target_user_uuid,
    tenant_id,
    actor_user_uuid,
    action,
    details
  ) VALUES (
    OLD.user_id,
    OLD.tenant_id,
    (SELECT auth.uid()),
    'user_left',
    jsonb_build_object(
      'role', OLD.role,
      'relationship_role', OLD.relationship_role,
      'access_scope', OLD.access_scope
    )
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_tenant_users_delete ON public.tenant_users;

CREATE TRIGGER trg_audit_tenant_users_delete
AFTER DELETE ON public.tenant_users
FOR EACH ROW
EXECUTE FUNCTION public.fn_audit_tenant_users_delete();