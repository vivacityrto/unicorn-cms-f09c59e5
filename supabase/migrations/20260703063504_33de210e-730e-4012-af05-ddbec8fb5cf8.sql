DROP POLICY IF EXISTS tenant_users_insert ON public.tenant_users;

CREATE POLICY tenant_users_insert ON public.tenant_users
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_tenant_parent_safe(tenant_id, (SELECT auth.uid() AS uid))
  );