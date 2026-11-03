-- Stop disabled and archived users from passing tenant-membership checks.
--
-- is_vivacity_team_safe() and is_super_admin_safe() already refuse users flagged disabled or
-- archived in public.users, but the tenant-membership helpers did not. Disabling a user does not
-- revoke their Supabase Auth session, so a disabled or archived client user with a surviving
-- membership row could still read and write tenant data through row-level security. As read on
-- 2026-11-03, 403 of 617 production tenant_users rows belong to 373 such users; 30 of those have
-- an auth account (all unbanned, none signed in within 90 days, one refreshed a token in that
-- window).
--
-- This adds the same restriction to the membership branch of each helper:
--   NOT EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = <caller> AND (u.disabled OR u.archived))
-- It is restrictive only. A caller with no public.users row is not newly refused (only an explicit
-- disabled or archived flag refuses), and the staff and Super Admin branches are unchanged.
-- Same signatures, so CREATE OR REPLACE replaces each function in place (no second overload) and
-- keeps its owner and grants. Not covered: policies that read tenant_users or tenant_members
-- directly, edge functions that query them, and the auth accounts themselves; see the audit entry.
-- Rollback: rollback/20261103030000_tenant_access_helpers_exclude_blocked_users.down.sql

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
    OR (
      EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE tenant_id = p_tenant_id
          AND user_id = p_user_id
          AND status = 'active'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_uuid = p_user_id AND (u.disabled OR u.archived)
      )
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
  AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid() AND (u.disabled OR u.archived)
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
  AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid() AND (u.disabled OR u.archived)
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
    and not exists (
      select 1 from public.users u
      where u.user_uuid = (select auth.uid()) and (u.disabled or u.archived)
    )
  end;
$function$;

-- Same restriction on the member branch of the portal audit-event check added in
-- 20261029130000_portal_audit_event_tenant_check.sql.
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
      OR (
        EXISTS (
          SELECT 1 FROM public.tenant_users tu
          WHERE tu.tenant_id = p_tenant_id
            AND tu.user_id = auth.uid()
            AND tu.access_scope = 'full'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.user_uuid = auth.uid() AND (u.disabled OR u.archived)
        )
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
