DROP POLICY IF EXISTS "tenant_users_delete" ON public.tenant_users;

CREATE POLICY "tenant_users_delete" ON public.tenant_users
  FOR DELETE
  USING (
    is_tenant_parent_safe(tenant_id, auth.uid())
    OR is_super_admin_safe(auth.uid())
  );