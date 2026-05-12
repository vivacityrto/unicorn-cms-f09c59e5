DROP POLICY IF EXISTS "pdp_cycles: tenant admins view their tenant" ON public.pdp_cycles;

CREATE POLICY "pdp_cycles: tenant admins view their tenant"
  ON public.pdp_cycles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
        AND tu.tenant_id = pdp_cycles.tenant_id
        AND tu.access_scope = 'full'
        AND (tu.primary_contact = true OR tu.secondary_contact = true)
    )
  );