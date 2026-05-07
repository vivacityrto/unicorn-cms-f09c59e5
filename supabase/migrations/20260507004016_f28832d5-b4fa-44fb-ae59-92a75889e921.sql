
-- 1. auth_tokens: remove client-side write policies (service role bypasses RLS)
DROP POLICY IF EXISTS auth_tokens_insert ON public.auth_tokens;
DROP POLICY IF EXISTS auth_tokens_update ON public.auth_tokens;
DROP POLICY IF EXISTS auth_tokens_delete ON public.auth_tokens;

-- Allow only super admins to manage rows from authenticated context; service role bypasses RLS automatically
CREATE POLICY auth_tokens_admin_insert ON public.auth_tokens
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin_safe(auth.uid()));

CREATE POLICY auth_tokens_admin_update ON public.auth_tokens
  FOR UPDATE TO authenticated
  USING (is_super_admin_safe(auth.uid()))
  WITH CHECK (is_super_admin_safe(auth.uid()));

CREATE POLICY auth_tokens_admin_delete ON public.auth_tokens
  FOR DELETE TO authenticated
  USING (is_super_admin_safe(auth.uid()));

-- 2. profiles: restrict cross-tenant reads to tenant admins / Vivacity staff
DROP POLICY IF EXISTS profiles_select_same_tenant ON public.profiles;

CREATE POLICY profiles_select_same_tenant_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users profile_user
      JOIN public.users current_user_record
        ON current_user_record.user_uuid = auth.uid()
      WHERE profile_user.user_uuid = profiles.user_id
        AND profile_user.tenant_id IS NOT NULL
        AND current_user_record.tenant_id IS NOT NULL
        AND profile_user.tenant_id = current_user_record.tenant_id
        AND COALESCE(current_user_record.role, '') IN ('admin','tenant_admin','superadmin')
    )
  );

-- 3. eos_workspaces: drop fully-permissive SELECT (vivacity + super admin policies remain)
DROP POLICY IF EXISTS eos_workspaces_select ON public.eos_workspaces;

-- 4. task-evidence storage: enforce tenant from path
DROP POLICY IF EXISTS "Users can view task evidence from their tenant" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload task evidence to their tenant folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own task evidence" ON storage.objects;

CREATE POLICY "task_evidence_select_tenant_scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-evidence'
    AND (storage.foldername(name))[1] ~ '^[0-9]+$'
    AND public.has_tenant_access_safe(((storage.foldername(name))[1])::bigint, auth.uid())
  );

CREATE POLICY "task_evidence_insert_tenant_scoped" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-evidence'
    AND (storage.foldername(name))[1] ~ '^[0-9]+$'
    AND public.has_tenant_access_safe(((storage.foldername(name))[1])::bigint, auth.uid())
  );

CREATE POLICY "task_evidence_delete_owner_or_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'task-evidence'
    AND (storage.foldername(name))[1] ~ '^[0-9]+$'
    AND (
      owner = auth.uid()
      OR public.is_super_admin_safe(auth.uid())
    )
    AND public.has_tenant_access_safe(((storage.foldername(name))[1])::bigint, auth.uid())
  );

-- 5. task-files storage: enforce tenant via task_id -> tasks_tenants.tenant_id
DROP POLICY IF EXISTS "Users can view their tenant task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their tenant task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their tenant task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their tenant task files" ON storage.objects;

CREATE POLICY "task_files_select_tenant_scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-files'
    AND (
      public.is_super_admin_safe(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.tasks_tenants t
        WHERE (storage.foldername(objects.name))[1] = t.id::text
          AND public.has_tenant_access_safe(t.tenant_id, auth.uid())
      )
    )
  );

CREATE POLICY "task_files_insert_tenant_scoped" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-files'
    AND (
      public.is_super_admin_safe(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.tasks_tenants t
        WHERE (storage.foldername(objects.name))[1] = t.id::text
          AND public.has_tenant_access_safe(t.tenant_id, auth.uid())
      )
    )
  );

CREATE POLICY "task_files_update_tenant_scoped" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'task-files'
    AND (
      public.is_super_admin_safe(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.tasks_tenants t
        WHERE (storage.foldername(objects.name))[1] = t.id::text
          AND public.has_tenant_access_safe(t.tenant_id, auth.uid())
      )
    )
  );

CREATE POLICY "task_files_delete_tenant_scoped" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'task-files'
    AND (
      public.is_super_admin_safe(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.tasks_tenants t
        WHERE (storage.foldername(objects.name))[1] = t.id::text
          AND public.has_tenant_access_safe(t.tenant_id, auth.uid())
      )
    )
  );

-- 6. Views: enforce security_invoker on remaining views missing it
ALTER VIEW public.v_client_dashboard_progress SET (security_invoker = true);
ALTER VIEW public.v_client_home_hero SET (security_invoker = true);
