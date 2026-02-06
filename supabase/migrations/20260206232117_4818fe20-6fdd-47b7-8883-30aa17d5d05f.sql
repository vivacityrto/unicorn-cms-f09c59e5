
-- ============================================================
-- Security Fix: Standardize client_notes RLS policies
-- Issue: client_notes_insufficient_isolation
-- Pattern: Use *_safe helper functions for tenant isolation
-- ============================================================

-- 1. DROP existing policies
DROP POLICY IF EXISTS "Users can view notes for their tenant" ON public.client_notes;
DROP POLICY IF EXISTS "Users can insert notes for their tenant" ON public.client_notes;
DROP POLICY IF EXISTS "Users can update notes for their tenant" ON public.client_notes;
DROP POLICY IF EXISTS "Users can delete notes for their tenant" ON public.client_notes;

-- 2. SELECT: Tenant members + Staff + SuperAdmin
CREATE POLICY "client_notes_select"
ON public.client_notes
FOR SELECT TO authenticated
USING (
  public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.is_super_admin_safe(auth.uid())
);

-- 3. INSERT: Tenant members + Staff + SuperAdmin
CREATE POLICY "client_notes_insert"
ON public.client_notes
FOR INSERT TO authenticated
WITH CHECK (
  public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.is_super_admin_safe(auth.uid())
);

-- 4. UPDATE: Tenant members + Staff + SuperAdmin
CREATE POLICY "client_notes_update"
ON public.client_notes
FOR UPDATE TO authenticated
USING (
  public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.is_super_admin_safe(auth.uid())
)
WITH CHECK (
  public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.is_super_admin_safe(auth.uid())
);

-- 5. DELETE: Tenant members + Staff + SuperAdmin
CREATE POLICY "client_notes_delete"
ON public.client_notes
FOR DELETE TO authenticated
USING (
  public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.is_super_admin_safe(auth.uid())
);

-- Add documentation comment
COMMENT ON TABLE public.client_notes IS 
'Client notes with RLS enforcing tenant isolation via has_tenant_access_safe. Vivacity staff and SuperAdmins have global access.';
