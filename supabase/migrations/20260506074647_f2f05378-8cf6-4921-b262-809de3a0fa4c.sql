CREATE POLICY users_select_assigned_csc
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_csc_assignments tca
      WHERE tca.csc_user_id = users.user_uuid
        AND app.user_can_access_tenant(tca.tenant_id)
    )
  );