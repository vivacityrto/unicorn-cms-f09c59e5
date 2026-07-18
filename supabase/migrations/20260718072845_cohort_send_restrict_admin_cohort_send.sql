-- Tighten cohort send job RLS: require admin.cohort.send (full) instead of the
-- broader is_vivacity_staff gate on restrictive policies. Service-role access
-- (cohort-access-sender-worker) is unaffected — service_role bypasses RLS.
--
-- Before applying to prod: run in BEGIN...ROLLBACK first, sign in as a persona
-- with is_vivacity_staff = true but admin.cohort.send != full, and confirm
-- SELECT/INSERT return zero rows / permission denied. Then re-run as COMMIT.

BEGIN;

DROP POLICY IF EXISTS "cohort_send_jobs_restrict_staff" ON public.cohort_send_jobs;
CREATE POLICY "cohort_send_jobs_restrict_admin_cohort_send"
ON public.cohort_send_jobs
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (check_permission((SELECT auth.uid()), 'admin.cohort.send', 'full'))
WITH CHECK (check_permission((SELECT auth.uid()), 'admin.cohort.send', 'full'));

DROP POLICY IF EXISTS "cohort_send_job_items_restrict_staff" ON public.cohort_send_job_items;
CREATE POLICY "cohort_send_job_items_restrict_admin_cohort_send"
ON public.cohort_send_job_items
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (check_permission((SELECT auth.uid()), 'admin.cohort.send', 'full'))
WITH CHECK (check_permission((SELECT auth.uid()), 'admin.cohort.send', 'full'));

NOTIFY pgrst, 'reload schema';

COMMIT;
