ALTER TABLE public.staff_provisioning_runs
ADD COLUMN IF NOT EXISTS workbook_file_path text;

DROP POLICY IF EXISTS "Internal onboarding workbook files read" ON storage.objects;
DROP POLICY IF EXISTS "Internal onboarding workbook files upload" ON storage.objects;
DROP POLICY IF EXISTS "Internal onboarding workbook files update" ON storage.objects;
DROP POLICY IF EXISTS "Internal onboarding workbook files delete" ON storage.objects;

CREATE POLICY "Internal onboarding workbook files read"
ON storage.objects
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  bucket_id = 'internal-onboarding'
  AND public.get_current_user_tenant_id() IS NOT NULL
);

CREATE POLICY "Internal onboarding workbook files upload"
ON storage.objects
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'internal-onboarding'
  AND public.get_current_user_tenant_id() IS NOT NULL
);

CREATE POLICY "Internal onboarding workbook files update"
ON storage.objects
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'internal-onboarding'
  AND public.get_current_user_tenant_id() IS NOT NULL
)
WITH CHECK (
  bucket_id = 'internal-onboarding'
  AND public.get_current_user_tenant_id() IS NOT NULL
);

CREATE POLICY "Internal onboarding workbook files delete"
ON storage.objects
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  bucket_id = 'internal-onboarding'
  AND public.get_current_user_tenant_id() IS NOT NULL
);