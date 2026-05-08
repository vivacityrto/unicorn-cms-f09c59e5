BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

-- stage_instances : SELECT
DROP POLICY IF EXISTS stage_instances_select_via_canonical_helper ON public.stage_instances;
CREATE POLICY stage_instances_select_via_canonical_helper
  ON public.stage_instances
  FOR SELECT
  TO authenticated
  USING (
    packageinstance_id IN (
      SELECT id FROM public.package_instances
      WHERE app.user_can_access_tenant(tenant_id)
    )
  );

-- stage_instances : UPDATE
DROP POLICY IF EXISTS stage_instances_update_via_canonical_helper ON public.stage_instances;
CREATE POLICY stage_instances_update_via_canonical_helper
  ON public.stage_instances
  FOR UPDATE
  TO authenticated
  USING (
    packageinstance_id IN (
      SELECT id FROM public.package_instances
      WHERE app.user_can_access_tenant(tenant_id)
    )
  )
  WITH CHECK (
    public.tenant_is_writeable(public.stage_instance_tenant_id(id))
    OR public.is_super_admin_safe((SELECT auth.uid()))
  );

-- client_task_instances : SELECT
DROP POLICY IF EXISTS cti_select_via_canonical_helper ON public.client_task_instances;
CREATE POLICY cti_select_via_canonical_helper
  ON public.client_task_instances
  FOR SELECT
  TO authenticated
  USING (
    stageinstance_id IN (
      SELECT si.id
      FROM public.stage_instances si
      JOIN public.package_instances pi ON pi.id = si.packageinstance_id
      WHERE app.user_can_access_tenant(pi.tenant_id)
    )
  );

-- client_task_instances : UPDATE
DROP POLICY IF EXISTS cti_update_via_canonical_helper ON public.client_task_instances;
CREATE POLICY cti_update_via_canonical_helper
  ON public.client_task_instances
  FOR UPDATE
  TO authenticated
  USING (
    stageinstance_id IN (
      SELECT si.id
      FROM public.stage_instances si
      JOIN public.package_instances pi ON pi.id = si.packageinstance_id
      WHERE app.user_can_access_tenant(pi.tenant_id)
    )
  )
  WITH CHECK (
    public.tenant_is_writeable(public.stage_instance_tenant_id(stageinstance_id))
    OR public.is_super_admin_safe((SELECT auth.uid()))
  );

COMMIT;