-- Relax internal-onboarding INSERT policy: allow uploads under the caller's
-- own folder (first path segment = auth.uid()) or by users with
-- admin.team_users.manage (full). Replaces the prior is_vivacity_team_safe gate
-- on this insert policy only.

BEGIN;

DROP POLICY IF EXISTS "Internal onboarding workbook files upload" ON storage.objects;

CREATE POLICY "Internal onboarding workbook files upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'internal-onboarding'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.check_permission(auth.uid(), 'admin.team_users.manage', 'full')
  )
);

COMMIT;

NOTIFY pgrst, 'reload schema';
