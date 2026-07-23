Apply the pre-verified PR #29 migration under today's date (23 Jul 2026).

The migration tightens RLS on `cohort_send_jobs` and `cohort_send_job_items` so that authenticated access requires `admin.cohort.send` permission at `full` level. This aligns the DB gate with the existing frontend routing (`/admin/cohort-sender` already requires Super Admin) and the current permission matrix (only Super Admin has `full` on `admin.cohort.send`).

SQL to apply (verbatim from prompt):

```sql
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
```

After approval, execute via `supabase--migration`, then confirm success so the user can verify live state and origin/main.