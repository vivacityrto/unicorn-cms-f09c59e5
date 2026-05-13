-- P1-b Batch E2: auth.uid() → (SELECT auth.uid()) hardening
-- 15 policies, 5 tables (evidence_*, excel_*, exec_*)

DROP POLICY IF EXISTS "tenant_users_create" ON public.evidence_gap_checks;
CREATE POLICY "tenant_users_create" ON public.evidence_gap_checks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "tenant_users_read_own" ON public.evidence_gap_checks;
CREATE POLICY "tenant_users_read_own" ON public.evidence_gap_checks AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "vivacity_team_full_access" ON public.evidence_gap_checks;
CREATE POLICY "vivacity_team_full_access" ON public.evidence_gap_checks AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "excel_generated_files_delete_policy" ON public.excel_generated_files;
CREATE POLICY "excel_generated_files_delete_policy" ON public.excel_generated_files AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "excel_generated_files_insert_policy" ON public.excel_generated_files;
CREATE POLICY "excel_generated_files_insert_policy" ON public.excel_generated_files AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'team'::text]))))));

DROP POLICY IF EXISTS "excel_generated_files_select_policy" ON public.excel_generated_files;
CREATE POLICY "excel_generated_files_select_policy" ON public.excel_generated_files AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((u.tenant_id = excel_generated_files.tenant_id) OR (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'team'::text])))))));

DROP POLICY IF EXISTS "excel_template_bindings_delete_policy" ON public.excel_template_bindings;
CREATE POLICY "excel_template_bindings_delete_policy" ON public.excel_template_bindings AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "excel_template_bindings_insert_policy" ON public.excel_template_bindings;
CREATE POLICY "excel_template_bindings_insert_policy" ON public.excel_template_bindings AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'team'::text]))))));

DROP POLICY IF EXISTS "excel_template_bindings_select_policy" ON public.excel_template_bindings;
CREATE POLICY "excel_template_bindings_select_policy" ON public.excel_template_bindings AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'team'::text]))))));

DROP POLICY IF EXISTS "excel_template_bindings_update_policy" ON public.excel_template_bindings;
CREATE POLICY "excel_template_bindings_update_policy" ON public.excel_template_bindings AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'team'::text]))))));

DROP POLICY IF EXISTS "vivacity_team_insert_audit_log" ON public.exec_weekly_review_audit_log;
CREATE POLICY "vivacity_team_insert_audit_log" ON public.exec_weekly_review_audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "vivacity_team_select_audit_log" ON public.exec_weekly_review_audit_log;
CREATE POLICY "vivacity_team_select_audit_log" ON public.exec_weekly_review_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "vivacity_team_insert_exec_weekly_reviews" ON public.exec_weekly_reviews;
CREATE POLICY "vivacity_team_insert_exec_weekly_reviews" ON public.exec_weekly_reviews AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "vivacity_team_select_exec_weekly_reviews" ON public.exec_weekly_reviews;
CREATE POLICY "vivacity_team_select_exec_weekly_reviews" ON public.exec_weekly_reviews AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "vivacity_team_update_exec_weekly_reviews" ON public.exec_weekly_reviews;
CREATE POLICY "vivacity_team_update_exec_weekly_reviews" ON public.exec_weekly_reviews AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_vivacity_team_safe((SELECT auth.uid())) AND ((status = 'draft'::text) OR is_super_admin_safe((SELECT auth.uid())))));
