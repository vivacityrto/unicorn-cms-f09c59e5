-- P1-b Batch 06: i% tables (6 policies, 3 tables)

-- import_rto_docs
DROP POLICY IF EXISTS import_rto_docs_admin_write ON public.import_rto_docs;
CREATE POLICY import_rto_docs_admin_write ON public.import_rto_docs AS PERMISSIVE FOR ALL TO authenticated USING (is_qc_admin_safe((SELECT auth.uid()))) WITH CHECK (is_qc_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS import_rto_docs_vivacity_select ON public.import_rto_docs;
CREATE POLICY import_rto_docs_vivacity_select ON public.import_rto_docs AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_user((SELECT auth.uid())));

-- integration_slack
DROP POLICY IF EXISTS integration_slack_manage ON public.integration_slack;
CREATE POLICY integration_slack_manage ON public.integration_slack AS PERMISSIVE FOR ALL TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND is_eos_admin((SELECT auth.uid()), tenant_id))));

DROP POLICY IF EXISTS integration_slack_select ON public.integration_slack;
CREATE POLICY integration_slack_select ON public.integration_slack AS PERMISSIVE FOR SELECT TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND is_eos_admin((SELECT auth.uid()), tenant_id))));

-- integration_teams
DROP POLICY IF EXISTS integration_teams_manage ON public.integration_teams;
CREATE POLICY integration_teams_manage ON public.integration_teams AS PERMISSIVE FOR ALL TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND is_eos_admin((SELECT auth.uid()), tenant_id))));

DROP POLICY IF EXISTS integration_teams_select ON public.integration_teams;
CREATE POLICY integration_teams_select ON public.integration_teams AS PERMISSIVE FOR SELECT TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND is_eos_admin((SELECT auth.uid()), tenant_id))));