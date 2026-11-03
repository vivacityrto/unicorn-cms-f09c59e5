-- Rollback for 20261029130000_portal_audit_event_tenant_check.sql.
-- Restores the previous function body (no caller or ownership checks). The EXECUTE grants are
-- not reverted: production already had exactly authenticated + service_role, and re-opening
-- PUBLIC/anon (as unicorn-qa had) is not wanted.

CREATE OR REPLACE FUNCTION public.log_portal_document_event(
  p_tenant_id bigint,
  p_document_id uuid,
  p_document_type text,
  p_action text,
  p_reason text DEFAULT NULL::text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_role text;
  v_log_id uuid;
BEGIN
  -- Determine actor role
  SELECT COALESCE(global_role, 'General User') INTO v_actor_role
  FROM public.users WHERE user_uuid = auth.uid();

  INSERT INTO public.portal_document_audit (
    tenant_id, document_id, document_type, action,
    actor_user_id, actor_role, reason, metadata
  ) VALUES (
    p_tenant_id, p_document_id, p_document_type, p_action,
    auth.uid(), v_actor_role, p_reason, p_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
