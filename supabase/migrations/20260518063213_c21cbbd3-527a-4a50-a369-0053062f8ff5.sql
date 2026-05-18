CREATE POLICY client_audits_tenant_read_active
  ON public.client_audits
  FOR SELECT
  TO authenticated
  USING (
    app.user_can_access_tenant(subject_tenant_id)
    AND status IN ('draft', 'in_progress', 'review', 'complete')
  );

COMMENT ON POLICY client_audits_tenant_read_active
  ON public.client_audits IS
  'Tenant members can read active audits (draft/in_progress/review/complete) for their tenant. Archived and cancelled are excluded; released-report visibility is governed by client_audits_tenant_read_v2.';