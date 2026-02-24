-- Fix tenant_users UPDATE policy to allow Super Admins
DROP POLICY IF EXISTS "tenant_users_update" ON public.tenant_users;

CREATE POLICY "tenant_users_update" ON public.tenant_users
FOR UPDATE
TO authenticated
USING (
  is_tenant_parent_safe(tenant_id, auth.uid()) OR is_super_admin_safe(auth.uid())
)
WITH CHECK (
  is_tenant_parent_safe(tenant_id, auth.uid()) OR is_super_admin_safe(auth.uid())
);