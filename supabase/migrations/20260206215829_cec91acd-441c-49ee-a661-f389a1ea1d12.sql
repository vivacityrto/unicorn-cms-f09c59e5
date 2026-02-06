-- ============================================
-- RLS Standardization: document_links Table
-- ============================================
-- Drop 6 existing overlapping/legacy policies
-- Create 4 clean standardized policies using *_safe functions

-- 1. DROP ALL EXISTING POLICIES
DROP POLICY IF EXISTS "document_links_select" ON public.document_links;
DROP POLICY IF EXISTS "document_links_manage" ON public.document_links;
DROP POLICY IF EXISTS "document_links_select_policy" ON public.document_links;
DROP POLICY IF EXISTS "document_links_insert_policy" ON public.document_links;
DROP POLICY IF EXISTS "document_links_update_policy" ON public.document_links;
DROP POLICY IF EXISTS "document_links_delete_policy" ON public.document_links;

-- 2. CREATE STANDARDIZED POLICIES

-- SELECT: Creator OR tenant access (includes SuperAdmin/Vivacity via helper)
CREATE POLICY "document_links_select"
ON public.document_links
FOR SELECT TO authenticated
USING (
  user_uuid = auth.uid()
  OR public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
);

-- INSERT: Creator with tenant access validation
CREATE POLICY "document_links_insert"
ON public.document_links
FOR INSERT TO authenticated
WITH CHECK (
  user_uuid = auth.uid()
  AND public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
);

-- UPDATE: Creator or SuperAdmin only
CREATE POLICY "document_links_update"
ON public.document_links
FOR UPDATE TO authenticated
USING (
  user_uuid = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
)
WITH CHECK (
  user_uuid = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
);

-- DELETE: SuperAdmin only
CREATE POLICY "document_links_delete"
ON public.document_links
FOR DELETE TO authenticated
USING (public.is_super_admin_safe(auth.uid()));