-- Make log_portal_document_event check who is calling and what they are logging against.
--
-- The function writes to portal_document_audit, which only staff can insert into directly. It
-- is SECURITY DEFINER and executable by every signed-in user, but it accepted whatever tenant
-- and document ids the caller sent, so any signed-in user could add audit rows to any tenant's
-- trail. For an end-user call it now requires:
--   1. the caller is staff, or a full-scope member of p_tenant_id (the older
--      user_has_tenant_access() ignores access_scope, so it is not used here);
--   2. p_document_type is 'portal_document' and p_action is one of the five actions the app
--      logs (uploaded, downloaded, shared_to_client, unshared, deleted);
--   3. the document exists and belongs to p_tenant_id.
-- Calls with no end user (auth.uid() is null: service_role / postgres) are unchanged.
--
-- Same signature, so CREATE OR REPLACE replaces the function in place (no second overload).
-- Existing callers (usePortalDocuments, useEvidenceRequests) already pass exactly these values;
-- all 99 existing audit rows satisfy the new rules.
-- Rollback: rollback/20261029130000_portal_audit_event_tenant_check.down.sql

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
  IF auth.uid() IS NOT NULL THEN
    IF NOT (
      public.is_staff()
      OR EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.tenant_id = p_tenant_id
          AND tu.user_id = auth.uid()
          AND tu.access_scope = 'full'
      )
    ) THEN
      RAISE EXCEPTION 'Not authorised to log events for this tenant'
        USING ERRCODE = '42501';
    END IF;

    IF p_document_type IS DISTINCT FROM 'portal_document'
       OR p_action IS NULL
       OR p_action NOT IN ('uploaded', 'downloaded', 'shared_to_client', 'unshared', 'deleted') THEN
      RAISE EXCEPTION 'Unsupported audit event'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.portal_documents d
      WHERE d.id = p_document_id
        AND d.tenant_id = p_tenant_id
    ) THEN
      RAISE EXCEPTION 'Document does not belong to this tenant'
        USING ERRCODE = '42501';
    END IF;
  END IF;

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

-- Only signed-in users and server paths may call it. Production already has exactly these
-- grants (no change there); unicorn-qa also let PUBLIC/anon execute it, and the no-end-user
-- branch above must not be reachable by an anonymous caller.
REVOKE ALL ON FUNCTION public.log_portal_document_event(bigint, uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_portal_document_event(bigint, uuid, text, text, text, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
