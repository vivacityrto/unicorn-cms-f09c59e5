-- FIX 1: Remove overly permissive tenants SELECT policy
DROP POLICY IF EXISTS "Authenticated users can count tenants for statistics" ON public.tenants;

CREATE OR REPLACE FUNCTION public.get_active_tenant_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM tenants WHERE lifecycle_status = 'active';
$$;

-- FIX 2: Remove {public} role policies on document-files bucket
DROP POLICY IF EXISTS "Public read access for document-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete document-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update document-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload document-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from document-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update document-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to document-files" ON storage.objects;

CREATE POLICY "Authenticated users can read document-files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'document-files');

CREATE POLICY "Authenticated users can upload document-files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'document-files');

CREATE POLICY "Authenticated users can update document-files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'document-files');

CREATE POLICY "Authenticated users can delete document-files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'document-files');

-- FIX 3: Remove public read policy on package-documents bucket
DROP POLICY IF EXISTS "Allow public read access to package documents" ON storage.objects;

-- FIX 4: Remove overly permissive task-files policies
DROP POLICY IF EXISTS "Users can view task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete task files" ON storage.objects;

CREATE POLICY "Users can upload to their tenant task files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-files'
    AND (
      is_super_admin()
      OR EXISTS (
        SELECT 1 FROM tasks_tenants t
        WHERE (storage.foldername(name))[1] = t.id::text
        AND (t.tenant_id = get_current_user_tenant() OR is_super_admin())
      )
    )
  );

CREATE POLICY "Users can update their tenant task files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'task-files'
    AND (
      is_super_admin()
      OR EXISTS (
        SELECT 1 FROM tasks_tenants t
        WHERE (storage.foldername(name))[1] = t.id::text
        AND (t.tenant_id = get_current_user_tenant() OR is_super_admin())
      )
    )
  );

-- FIX 5: Scope tenant-note-files policies
DROP POLICY IF EXISTS "Authenticated users can view tenant note files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload tenant note files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update tenant note files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete tenant note files" ON storage.objects;

CREATE POLICY "Staff or members can view tenant note files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'tenant-note-files'
    AND (
      is_super_admin_safe(auth.uid())
      OR is_vivacity_team_safe(auth.uid())
      OR has_tenant_access_safe(get_current_user_tenant(), auth.uid())
    )
  );

CREATE POLICY "Staff or members can upload tenant note files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-note-files'
    AND (
      is_super_admin_safe(auth.uid())
      OR is_vivacity_team_safe(auth.uid())
      OR has_tenant_access_safe(get_current_user_tenant(), auth.uid())
    )
  );

CREATE POLICY "Staff or members can update tenant note files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-note-files'
    AND (
      is_super_admin_safe(auth.uid())
      OR is_vivacity_team_safe(auth.uid())
      OR has_tenant_access_safe(get_current_user_tenant(), auth.uid())
    )
  );

CREATE POLICY "Staff or members can delete tenant note files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-note-files'
    AND (
      is_super_admin_safe(auth.uid())
      OR is_vivacity_team_safe(auth.uid())
      OR has_tenant_access_safe(get_current_user_tenant(), auth.uid())
    )
  );
