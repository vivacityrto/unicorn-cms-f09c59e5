-- RLS Standardization: meetings table
-- Drop 4 legacy policies and create 4 standardized policies

-- 1. DROP existing legacy policies
DROP POLICY IF EXISTS "Users can view own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can view shared meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can insert own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can update own meetings" ON public.meetings;

-- 2. CREATE standardized policies

-- SELECT: Owner, shared viewer, or SuperAdmin
CREATE POLICY "meetings_select"
ON public.meetings
FOR SELECT TO authenticated
USING (
  owner_user_uuid = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.calendar_shares cs
    WHERE cs.owner_user_uuid = meetings.owner_user_uuid
      AND cs.viewer_user_uuid = auth.uid()
  )
  OR public.is_super_admin_safe(auth.uid())
);

-- INSERT: Owner with tenant access
CREATE POLICY "meetings_insert"
ON public.meetings
FOR INSERT TO authenticated
WITH CHECK (
  owner_user_uuid = auth.uid()
  AND public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- UPDATE: Owner, shared manage permission, or SuperAdmin
CREATE POLICY "meetings_update"
ON public.meetings
FOR UPDATE TO authenticated
USING (
  owner_user_uuid = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.calendar_shares cs
    WHERE cs.owner_user_uuid = meetings.owner_user_uuid
      AND cs.viewer_user_uuid = auth.uid()
      AND cs.permission = 'manage'
  )
  OR public.is_super_admin_safe(auth.uid())
)
WITH CHECK (
  owner_user_uuid = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.calendar_shares cs
    WHERE cs.owner_user_uuid = meetings.owner_user_uuid
      AND cs.viewer_user_uuid = auth.uid()
      AND cs.permission = 'manage'
  )
  OR public.is_super_admin_safe(auth.uid())
);

-- DELETE: SuperAdmin only
CREATE POLICY "meetings_delete"
ON public.meetings
FOR DELETE TO authenticated
USING (public.is_super_admin_safe(auth.uid()));