-- Update documents SELECT policy to handle NULL tenant_id (master documents)
DROP POLICY IF EXISTS "documents_select" ON public.documents;
CREATE POLICY "documents_select" 
ON public.documents 
FOR SELECT 
TO public
USING (
  -- Super Admins and Team Leaders can see all documents
  (is_super_admin() OR get_current_user_role() = 'Team Leader')
  OR 
  -- Users can see their tenant's documents
  (tenant_id IS NOT NULL AND get_current_user_tenant() = tenant_id)
  OR
  -- Master documents (tenant_id IS NULL) are visible to all authenticated users
  tenant_id IS NULL
);