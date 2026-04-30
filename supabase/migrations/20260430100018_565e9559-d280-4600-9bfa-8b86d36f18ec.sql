-- 1. process_versions: drop the loose policy; keep tenant-scoped one
DROP POLICY IF EXISTS process_versions_users_select ON public.process_versions;

-- 2. suggest-attachments: replace broad SELECT/INSERT with owner-scoped
DROP POLICY IF EXISTS suggest_attach_select ON storage.objects;
DROP POLICY IF EXISTS suggest_attach_upload ON storage.objects;

CREATE POLICY suggest_attach_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'suggest-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[2]
);

CREATE POLICY suggest_attach_upload
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'suggest-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[2]
);

-- 3. compliance-packs: lock down INSERT/UPDATE to vivacity staff only
DROP POLICY IF EXISTS "Service can write compliance packs" ON storage.objects;
DROP POLICY IF EXISTS "Service can update compliance packs" ON storage.objects;

CREATE POLICY "Vivacity staff can write compliance packs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'compliance-packs'
  AND public.is_vivacity_team_safe(auth.uid())
);

CREATE POLICY "Vivacity staff can update compliance packs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'compliance-packs'
  AND public.is_vivacity_team_safe(auth.uid())
)
WITH CHECK (
  bucket_id = 'compliance-packs'
  AND public.is_vivacity_team_safe(auth.uid())
);