-- Reconciliation of PR #29 (originally timestamped 20260718072845).
-- The DB changes are already live from a prior direct application; this
-- re-issues the same DDL under a fresh timestamp so schema_migrations
-- records it. All statements are idempotent.

BEGIN;

DROP POLICY IF EXISTS "cohort_send_jobs_restrict_staff" ON public.cohort_send_jobs;
DROP POLICY IF EXISTS "cohort_send_jobs_restrict_admin_cohort_send" ON public.cohort_send_jobs;
CREATE POLICY "cohort_send_jobs_restrict_admin_cohort_send"
ON public.cohort_send_jobs
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (check_permission((SELECT auth.uid()), 'admin.cohort.send', 'full'))
WITH CHECK (check_permission((SELECT auth.uid()), 'admin.cohort.send', 'full'));

DROP POLICY IF EXISTS "cohort_send_job_items_restrict_staff" ON public.cohort_send_job_items;
DROP POLICY IF EXISTS "cohort_send_job_items_restrict_admin_cohort_send" ON public.cohort_send_job_items;
CREATE POLICY "cohort_send_job_items_restrict_admin_cohort_send"
ON public.cohort_send_job_items
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (check_permission((SELECT auth.uid()), 'admin.cohort.send', 'full'))
WITH CHECK (check_permission((SELECT auth.uid()), 'admin.cohort.send', 'full'));

NOTIFY pgrst, 'reload schema';

COMMIT;