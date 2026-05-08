
-- 1. Fix privilege escalation on users table
DROP POLICY IF EXISTS users_update_own ON public.users;

CREATE POLICY users_update_own ON public.users
  FOR UPDATE
  TO authenticated
  USING (user_uuid = auth.uid())
  WITH CHECK (
    user_uuid = auth.uid()
    AND unicorn_role IS NOT DISTINCT FROM (SELECT u.unicorn_role FROM public.users u WHERE u.user_uuid = auth.uid())
    AND is_vivacity_internal IS NOT DISTINCT FROM (SELECT u.is_vivacity_internal FROM public.users u WHERE u.user_uuid = auth.uid())
    AND global_role IS NOT DISTINCT FROM (SELECT u.global_role FROM public.users u WHERE u.user_uuid = auth.uid())
    AND superadmin_level IS NOT DISTINCT FROM (SELECT u.superadmin_level FROM public.users u WHERE u.user_uuid = auth.uid())
    AND tenant_id IS NOT DISTINCT FROM (SELECT u.tenant_id FROM public.users u WHERE u.user_uuid = auth.uid())
  );

-- 2. Lock down support-attachments bucket
UPDATE storage.buckets SET public = false WHERE id = 'support-attachments';

DROP POLICY IF EXISTS support_attachments_select_authenticated ON storage.objects;
DROP POLICY IF EXISTS support_attachments_insert_authenticated ON storage.objects;

CREATE POLICY support_attachments_select_tenant ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (
      public.is_vivacity_team_safe(auth.uid())
      OR public.has_tenant_access_safe(((storage.foldername(name))[1])::bigint, auth.uid())
    )
  );

CREATE POLICY support_attachments_insert_tenant ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND (
      public.is_vivacity_team_safe(auth.uid())
      OR public.has_tenant_access_safe(((storage.foldername(name))[1])::bigint, auth.uid())
    )
  );

CREATE POLICY support_attachments_update_tenant ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (
      public.is_vivacity_team_safe(auth.uid())
      OR public.has_tenant_access_safe(((storage.foldername(name))[1])::bigint, auth.uid())
    )
  );

CREATE POLICY support_attachments_delete_tenant ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (
      public.is_vivacity_team_safe(auth.uid())
      OR public.has_tenant_access_safe(((storage.foldername(name))[1])::bigint, auth.uid())
    )
  );

-- 3. Switch remaining views to security_invoker
ALTER VIEW public.v_dashboard_tenant_portfolio SET (security_invoker = true);
ALTER VIEW public.v_client_package_dashboard SET (security_invoker = true);
