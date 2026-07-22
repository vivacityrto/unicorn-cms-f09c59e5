-- Align internal-onboarding upload policy with read/update/delete siblings
DROP POLICY IF EXISTS "Internal onboarding workbook files upload" ON storage.objects;

CREATE POLICY "Internal onboarding workbook files upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'internal-onboarding'
    AND check_permission(auth.uid(), 'admin.team_users.manage', 'full')
  );