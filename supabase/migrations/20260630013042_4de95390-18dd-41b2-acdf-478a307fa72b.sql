-- 1) email_attachments: replace permissive ALL policy with tenant/staff scoping
DROP POLICY IF EXISTS email_attachments_users_all ON public.email_attachments;

CREATE POLICY email_attachments_authenticated_select
  ON public.email_attachments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.emails e WHERE e.id = email_attachments.email_id)
  );

CREATE POLICY email_attachments_staff_write
  ON public.email_attachments
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (public.is_staff() OR public.is_super_admin())
  WITH CHECK (public.is_staff() OR public.is_super_admin());

-- 2) user_invitations_accept: require caller's JWT email to match invitation email
DROP POLICY IF EXISTS user_invitations_accept ON public.user_invitations;

CREATE POLICY user_invitations_accept
  ON public.user_invitations
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    token_hash IS NOT NULL
    AND status = 'pending'
    AND lower(email) = lower(COALESCE(
      (auth.jwt() ->> 'email')::text,
      (SELECT u.email FROM auth.users u WHERE u.id = auth.uid())
    ))
  )
  WITH CHECK (
    status = ANY (ARRAY['successful'::text, 'expired'::text])
    AND lower(email) = lower(COALESCE(
      (auth.jwt() ->> 'email')::text,
      (SELECT u.email FROM auth.users u WHERE u.id = auth.uid())
    ))
  );