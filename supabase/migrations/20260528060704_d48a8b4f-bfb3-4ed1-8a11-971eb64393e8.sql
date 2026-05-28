CREATE POLICY "documents_select_global_for_tenant_users"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
    )
  );