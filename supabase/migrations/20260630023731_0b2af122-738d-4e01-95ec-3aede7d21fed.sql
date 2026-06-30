DROP POLICY IF EXISTS tga_organisations_select ON public.tga_organisations;
CREATE POLICY tga_organisations_select
  ON public.tga_organisations
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM public.tga_links tl
      JOIN public.tenant_users tu ON tu.tenant_id = tl.tenant_id
      WHERE tl.rto_number = public.tga_organisations.code
        AND tu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tga_rtos_select_authenticated ON public.tga_rtos;
CREATE POLICY tga_rtos_select_authenticated
  ON public.tga_rtos
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM public.tga_links tl
      JOIN public.tenant_users tu ON tu.tenant_id = tl.tenant_id
      WHERE tl.rto_number = public.tga_rtos.rto_number
        AND tu.user_id = auth.uid()
    )
  );