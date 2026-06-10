DROP POLICY IF EXISTS tenant_registry_links_tenant_select_own
  ON public.tenant_registry_links;

CREATE POLICY tenant_registry_links_tenant_select_own
  ON public.tenant_registry_links
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY tenant_registry_links_tenant_admin_write
  ON public.tenant_registry_links
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_admin_safe(tenant_id, auth.uid()));

CREATE POLICY tenant_registry_links_tenant_admin_update
  ON public.tenant_registry_links
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_admin_safe(tenant_id, auth.uid()))
  WITH CHECK (public.has_tenant_admin_safe(tenant_id, auth.uid()));