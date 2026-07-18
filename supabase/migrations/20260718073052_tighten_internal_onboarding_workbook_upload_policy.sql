-- Tighten internal-onboarding INSERT policy: require
-- admin.team_users.manage (full). Removes the own-folder exception from
-- 20260718065713. Direct client uploads and the staff-onboarding-workbook
-- edge function (service role) both must enforce the same HR/Admin gate.

BEGIN;

DROP POLICY IF EXISTS "Internal onboarding workbook files upload" ON storage.objects;

CREATE POLICY "Internal onboarding workbook files upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'internal-onboarding'
  AND public.check_permission((SELECT auth.uid()), 'admin.team_users.manage', 'full')
);

NOTIFY pgrst, 'reload schema';

COMMIT;
