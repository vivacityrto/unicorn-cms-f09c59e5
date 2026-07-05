DROP POLICY IF EXISTS email_attachments_authenticated_select ON public.email_attachments;

CREATE POLICY email_attachments_staff_select
  ON public.email_attachments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_staff() OR public.is_super_admin());