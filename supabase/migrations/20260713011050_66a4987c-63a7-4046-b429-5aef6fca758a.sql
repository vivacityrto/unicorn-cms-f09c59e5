
-- 1) Tighten documents global (NULL tenant) policy — require is_core = true
DROP POLICY IF EXISTS documents_select_global_for_tenant_users ON public.documents;
CREATE POLICY documents_select_global_for_tenant_users ON public.documents
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    AND is_core = true
    AND EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
  );

-- 2) Restrict users same-tenant PII exposure — only tenant admins/staff can view other tenant members
DROP POLICY IF EXISTS users_select_same_tenant ON public.users;
CREATE POLICY users_select_same_tenant ON public.users
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.status = 'active'
        AND tm.tenant_id = users.tenant_id
        AND COALESCE(tm.role, '') IN ('admin','tenant_admin','owner','Administrator')
    )
  );

-- 3) Scope avatars storage SELECT to same tenant as file owner (folder = user_uuid) or staff/self
DROP POLICY IF EXISTS "Avatar select policy" ON storage.objects;
CREATE POLICY "Avatar select policy" ON storage.objects
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.is_super_admin_admin()
      OR EXISTS (
        SELECT 1
        FROM public.users owner
        JOIN public.tenant_members tm ON tm.tenant_id = owner.tenant_id
        WHERE owner.user_uuid::text = (storage.foldername(name))[1]
          AND tm.user_id = auth.uid()
          AND tm.status = 'active'
      )
    )
  );
