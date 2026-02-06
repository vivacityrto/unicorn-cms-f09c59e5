-- =============================================
-- RLS Standardization: email_messages Table
-- Migrate from legacy functions to *_safe helpers
-- =============================================

-- 1. DROP existing legacy policies
DROP POLICY IF EXISTS "email_messages_select_own" ON public.email_messages;
DROP POLICY IF EXISTS "email_messages_select_superadmin" ON public.email_messages;
DROP POLICY IF EXISTS "email_messages_insert_own" ON public.email_messages;
DROP POLICY IF EXISTS "email_messages_update_own" ON public.email_messages;
DROP POLICY IF EXISTS "email_messages_delete_superadmin" ON public.email_messages;

-- 2. CREATE standardized policies using *_safe functions

-- SELECT: Owner or SuperAdmin
CREATE POLICY "email_messages_select"
ON public.email_messages
FOR SELECT TO authenticated
USING (
  user_uuid = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
);

-- INSERT: Vivacity Team with tenant access (internal feature only)
CREATE POLICY "email_messages_insert"
ON public.email_messages
FOR INSERT TO authenticated
WITH CHECK (
  user_uuid = auth.uid()
  AND public.is_vivacity_team_safe(auth.uid())
  AND public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- UPDATE: Owner only (for linking fields: client_id, package_id, task_id)
CREATE POLICY "email_messages_update"
ON public.email_messages
FOR UPDATE TO authenticated
USING (user_uuid = auth.uid())
WITH CHECK (user_uuid = auth.uid());

-- DELETE: SuperAdmin only
CREATE POLICY "email_messages_delete"
ON public.email_messages
FOR DELETE TO authenticated
USING (public.is_super_admin_safe(auth.uid()));