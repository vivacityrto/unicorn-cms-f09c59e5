-- Reconcile M2: RESTRICTIVE backstops on 5 crown-jewel tables.
-- Mirrors original 12-13 Jul policy scope (is_vivacity_staff on cohort tables).
-- PR #29 would later tighten cohort tables further to admin.cohort.send -
-- that's a separate product decision, deliberately NOT folded in here.

DROP POLICY IF EXISTS emails_restrict_staff_only ON public.emails;
CREATE POLICY emails_restrict_staff_only
ON public.emails AS RESTRICTIVE FOR ALL TO authenticated
USING (is_staff() OR is_super_admin())
WITH CHECK (is_staff() OR is_super_admin());

DROP POLICY IF EXISTS auth_tokens_restrict_superadmin ON public.auth_tokens;
CREATE POLICY auth_tokens_restrict_superadmin
ON public.auth_tokens AS RESTRICTIVE FOR ALL TO authenticated
USING (is_super_admin_safe((SELECT auth.uid())))
WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS oauth_tokens_restrict_owner_or_superadmin ON public.oauth_tokens;
CREATE POLICY oauth_tokens_restrict_owner_or_superadmin
ON public.oauth_tokens AS RESTRICTIVE FOR ALL TO public
USING (((SELECT auth.uid()) = user_id) OR is_super_admin_safe((SELECT auth.uid())))
WITH CHECK (((SELECT auth.uid()) = user_id) OR is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS cohort_send_jobs_restrict_staff ON public.cohort_send_jobs;
CREATE POLICY cohort_send_jobs_restrict_staff
ON public.cohort_send_jobs AS RESTRICTIVE FOR ALL TO authenticated
USING (is_vivacity_staff((SELECT auth.uid())))
WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS cohort_send_job_items_restrict_staff ON public.cohort_send_job_items;
CREATE POLICY cohort_send_job_items_restrict_staff
ON public.cohort_send_job_items AS RESTRICTIVE FOR ALL TO authenticated
USING (is_vivacity_staff((SELECT auth.uid())))
WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

NOTIFY pgrst, 'reload schema';
-- sync-nudge 2026-07-22: file present in working tree; awaiting Lovable→GitHub flush
