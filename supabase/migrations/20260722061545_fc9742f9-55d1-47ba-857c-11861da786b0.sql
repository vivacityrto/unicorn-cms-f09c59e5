-- Reconcile H3: scope internal-onboarding read/update/delete to admin-only
DROP POLICY IF EXISTS "Internal onboarding workbook files read" ON storage.objects;
CREATE POLICY "Internal onboarding workbook files read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'internal-onboarding' AND check_permission(auth.uid(), 'admin.team_users.manage', 'full'));

DROP POLICY IF EXISTS "Internal onboarding workbook files update" ON storage.objects;
CREATE POLICY "Internal onboarding workbook files update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'internal-onboarding' AND check_permission(auth.uid(), 'admin.team_users.manage', 'full'))
  WITH CHECK (bucket_id = 'internal-onboarding' AND check_permission(auth.uid(), 'admin.team_users.manage', 'full'));

DROP POLICY IF EXISTS "Internal onboarding workbook files delete" ON storage.objects;
CREATE POLICY "Internal onboarding workbook files delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'internal-onboarding' AND check_permission(auth.uid(), 'admin.team_users.manage', 'full'));

NOTIFY pgrst, 'reload schema';