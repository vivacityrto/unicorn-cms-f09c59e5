-- Rollback for 20261103030000_tenant_access_helpers_exclude_blocked_users.sql.
-- Restores the helper bodies that were live before it (membership checks that ignore the
-- disabled and archived flags). Same signatures; grants and owners are unchanged.

CREATE OR REPLACE FUNCTION public.has_tenant_access_safe(p_tenant_id bigint, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  SELECT 
    public.is_super_admin_safe(p_user_id)
    OR public.is_vivacity_team_safe(p_user_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_members
      WHERE tenant_id = p_tenant_id
        AND user_id = p_user_id
        AND status = 'active'
    );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_tenant_access(p_tenant_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
  )
$function$;

CREATE OR REPLACE FUNCTION public.user_has_full_tenant_access(p_tenant_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id
      AND tu.user_id = auth.uid()
      AND tu.access_scope = 'full'
  )
$function$;

CREATE OR REPLACE FUNCTION app.user_can_access_tenant(p_tenant_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app', 'auth'
AS $function$
  select case
    when p_tenant_id is null then false
    when (select auth.uid()) is null then false
    when app.is_super_admin() then true
    when app.is_vivacity_team() then true
    else exists (
      select 1 from public.tenant_users tu
      where tu.tenant_id = p_tenant_id
        and tu.user_id = (select auth.uid())
        and tu.access_scope = 'full'
    )
  end;
$function$;

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

NOTIFY pgrst, 'reload schema';
