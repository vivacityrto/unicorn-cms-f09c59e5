-- Fix: tenant_document_releases SELECT policy is too permissive (USING true)
-- Replace with tenant-scoped access using existing helper functions

DROP POLICY IF EXISTS "Authenticated users can view tenant document releases" ON public.tenant_document_releases;

-- Users can view releases for their own tenant, or Vivacity staff can view all
CREATE POLICY "Users view own tenant releases"
  ON public.tenant_document_releases
  FOR SELECT
  TO authenticated
  USING (
    public.has_tenant_access_safe(tenant_id, auth.uid())
  );