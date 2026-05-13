-- P1-b Batch 09: r% tables (52 policies, 15 tables)

-- real_time_risk_alerts
DROP POLICY IF EXISTS rt_risk_alerts_vivacity_select ON public.real_time_risk_alerts;
CREATE POLICY rt_risk_alerts_vivacity_select ON public.real_time_risk_alerts AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS rt_risk_alerts_vivacity_update ON public.real_time_risk_alerts;
CREATE POLICY rt_risk_alerts_vivacity_update ON public.real_time_risk_alerts AS PERMISSIVE FOR UPDATE TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- regulator_change_events
DROP POLICY IF EXISTS regulator_change_events_superadmin_all ON public.regulator_change_events;
CREATE POLICY regulator_change_events_superadmin_all ON public.regulator_change_events AS PERMISSIVE FOR ALL TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS regulator_change_events_vivacity_select ON public.regulator_change_events;
CREATE POLICY regulator_change_events_vivacity_select ON public.regulator_change_events AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS regulator_change_events_vivacity_update ON public.regulator_change_events;
CREATE POLICY regulator_change_events_vivacity_update ON public.regulator_change_events AS PERMISSIVE FOR UPDATE TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

-- regulator_watchlist
DROP POLICY IF EXISTS regulator_watchlist_superadmin_all ON public.regulator_watchlist;
CREATE POLICY regulator_watchlist_superadmin_all ON public.regulator_watchlist AS PERMISSIVE FOR ALL TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS regulator_watchlist_vivacity_all ON public.regulator_watchlist;
CREATE POLICY regulator_watchlist_vivacity_all ON public.regulator_watchlist AS PERMISSIVE FOR ALL TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS superadmin_full_access_regulator_watchlist ON public.regulator_watchlist;
CREATE POLICY superadmin_full_access_regulator_watchlist ON public.regulator_watchlist AS PERMISSIVE FOR ALL TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_team_select_regulator_watchlist ON public.regulator_watchlist;
CREATE POLICY vivacity_team_select_regulator_watchlist ON public.regulator_watchlist AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

-- release_notes
DROP POLICY IF EXISTS release_notes_superadmin_all ON public.release_notes;
CREATE POLICY release_notes_superadmin_all ON public.release_notes AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

-- research_audit_log
DROP POLICY IF EXISTS superadmin_read_research_audit_log ON public.research_audit_log;
CREATE POLICY superadmin_read_research_audit_log ON public.research_audit_log AS PERMISSIVE FOR SELECT TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_team_insert_research_audit_log ON public.research_audit_log;
CREATE POLICY vivacity_team_insert_research_audit_log ON public.research_audit_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_team_read_research_audit_log ON public.research_audit_log;
CREATE POLICY vivacity_team_read_research_audit_log ON public.research_audit_log AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

-- research_findings
DROP POLICY IF EXISTS read_research_findings_via_job ON public.research_findings;
CREATE POLICY read_research_findings_via_job ON public.research_findings AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM research_jobs j
  WHERE ((j.id = research_findings.job_id) AND (is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(j.tenant_id, (SELECT auth.uid())))))));

DROP POLICY IF EXISTS vivacity_team_insert_research_findings ON public.research_findings;
CREATE POLICY vivacity_team_insert_research_findings ON public.research_findings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_team_update_research_findings ON public.research_findings;
CREATE POLICY vivacity_team_update_research_findings ON public.research_findings AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- research_jobs
DROP POLICY IF EXISTS tenant_users_read_own_research_jobs ON public.research_jobs;
CREATE POLICY tenant_users_read_own_research_jobs ON public.research_jobs AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id IS NOT NULL) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS vivacity_team_insert_research_jobs ON public.research_jobs;
CREATE POLICY vivacity_team_insert_research_jobs ON public.research_jobs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_team_safe((SELECT auth.uid())) AND (created_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS vivacity_team_read_all_research_jobs ON public.research_jobs;
CREATE POLICY vivacity_team_read_all_research_jobs ON public.research_jobs AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_team_update_research_jobs ON public.research_jobs;
CREATE POLICY vivacity_team_update_research_jobs ON public.research_jobs AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- research_sources
DROP POLICY IF EXISTS read_research_sources_via_job ON public.research_sources;
CREATE POLICY read_research_sources_via_job ON public.research_sources AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM research_jobs j
  WHERE ((j.id = research_sources.job_id) AND (is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(j.tenant_id, (SELECT auth.uid())))))));

DROP POLICY IF EXISTS vivacity_team_insert_research_sources ON public.research_sources;
CREATE POLICY vivacity_team_insert_research_sources ON public.research_sources AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

-- resource_favourites
DROP POLICY IF EXISTS resource_favourites_all ON public.resource_favourites;
CREATE POLICY resource_favourites_all ON public.resource_favourites AS PERMISSIVE FOR ALL TO public USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS resource_favourites_users_delete_own ON public.resource_favourites;
CREATE POLICY resource_favourites_users_delete_own ON public.resource_favourites AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS resource_favourites_users_insert_own ON public.resource_favourites;
CREATE POLICY resource_favourites_users_insert_own ON public.resource_favourites AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS resource_favourites_users_select_own ON public.resource_favourites;
CREATE POLICY resource_favourites_users_select_own ON public.resource_favourites AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (SELECT auth.uid())));

-- resource_library
DROP POLICY IF EXISTS resource_library_select_member ON public.resource_library;
CREATE POLICY resource_library_select_member ON public.resource_library AS PERMISSIVE FOR SELECT TO public USING (((access_level = 'member'::text) AND ((SELECT auth.uid()) IS NOT NULL)));

DROP POLICY IF EXISTS resource_library_staff_delete ON public.resource_library;
CREATE POLICY resource_library_staff_delete ON public.resource_library AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = ANY (ARRAY['Super Admin'::text, 'Team Leader'::text, 'Team Member'::text]))))));

DROP POLICY IF EXISTS resource_library_staff_insert ON public.resource_library;
CREATE POLICY resource_library_staff_insert ON public.resource_library AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = ANY (ARRAY['Super Admin'::text, 'Team Leader'::text, 'Team Member'::text]))))));

DROP POLICY IF EXISTS resource_library_staff_update ON public.resource_library;
CREATE POLICY resource_library_staff_update ON public.resource_library AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = ANY (ARRAY['Super Admin'::text, 'Team Leader'::text, 'Team Member'::text]))))));

-- resource_usage
DROP POLICY IF EXISTS resource_usage_insert ON public.resource_usage;
CREATE POLICY resource_usage_insert ON public.resource_usage AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS resource_usage_select ON public.resource_usage;
CREATE POLICY resource_usage_select ON public.resource_usage AS PERMISSIVE FOR SELECT TO public USING ((((SELECT auth.uid()) = user_id) OR is_super_admin()));

DROP POLICY IF EXISTS resource_usage_staff_select ON public.resource_usage;
CREATE POLICY resource_usage_staff_select ON public.resource_usage AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = ANY (ARRAY['Super Admin'::text, 'Team Leader'::text, 'Team Member'::text]))))));

DROP POLICY IF EXISTS resource_usage_users_insert_own ON public.resource_usage;
CREATE POLICY resource_usage_users_insert_own ON public.resource_usage AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS resource_usage_users_select_own ON public.resource_usage;
CREATE POLICY resource_usage_users_select_own ON public.resource_usage AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (SELECT auth.uid())));

-- retention_forecast_history
DROP POLICY IF EXISTS vivacity_staff_select_retention_history ON public.retention_forecast_history;
CREATE POLICY vivacity_staff_select_retention_history ON public.retention_forecast_history AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- reusable_audit_templates
DROP POLICY IF EXISTS reusable_audit_templates_delete ON public.reusable_audit_templates;
CREATE POLICY reusable_audit_templates_delete ON public.reusable_audit_templates AS PERMISSIVE FOR DELETE TO public USING ((is_super_admin() OR (user_in_tenant(tenant_id) AND (created_by = (SELECT auth.uid())))));

DROP POLICY IF EXISTS reusable_audit_templates_insert ON public.reusable_audit_templates;
CREATE POLICY reusable_audit_templates_insert ON public.reusable_audit_templates AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_in_tenant(tenant_id) AND ((created_by = (SELECT auth.uid())) OR (created_by IS NULL))));

DROP POLICY IF EXISTS reusable_audit_templates_update ON public.reusable_audit_templates;
CREATE POLICY reusable_audit_templates_update ON public.reusable_audit_templates AS PERMISSIVE FOR UPDATE TO public USING ((is_super_admin() OR (user_in_tenant(tenant_id) AND (created_by = (SELECT auth.uid())))));

-- risk_events
DROP POLICY IF EXISTS tenant_read_own_risk_events ON public.risk_events;
CREATE POLICY tenant_read_own_risk_events ON public.risk_events AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_insert_risk_events ON public.risk_events;
CREATE POLICY vivacity_insert_risk_events ON public.risk_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_read_all_risk_events ON public.risk_events;
CREATE POLICY vivacity_read_all_risk_events ON public.risk_events AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_update_risk_events ON public.risk_events;
CREATE POLICY vivacity_update_risk_events ON public.risk_events AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- risk_forecast_history
DROP POLICY IF EXISTS risk_history_insert_staff ON public.risk_forecast_history;
CREATE POLICY risk_history_insert_staff ON public.risk_forecast_history AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS risk_history_select_staff ON public.risk_forecast_history;
CREATE POLICY risk_history_select_staff ON public.risk_forecast_history AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS risk_history_select_tenant ON public.risk_forecast_history;
CREATE POLICY risk_history_select_tenant ON public.risk_forecast_history AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

-- risk_items
DROP POLICY IF EXISTS risk_items_tenant_select_own ON public.risk_items;
CREATE POLICY risk_items_tenant_select_own ON public.risk_items AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS risk_items_vivacity_insert ON public.risk_items;
CREATE POLICY risk_items_vivacity_insert ON public.risk_items AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS risk_items_vivacity_select ON public.risk_items;
CREATE POLICY risk_items_vivacity_select ON public.risk_items AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS risk_items_vivacity_update ON public.risk_items;
CREATE POLICY risk_items_vivacity_update ON public.risk_items AS PERMISSIVE FOR UPDATE TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- risk_theme_catalog
DROP POLICY IF EXISTS superadmin_manage_risk_themes ON public.risk_theme_catalog;
CREATE POLICY superadmin_manage_risk_themes ON public.risk_theme_catalog AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_read_risk_themes ON public.risk_theme_catalog;
CREATE POLICY vivacity_read_risk_themes ON public.risk_theme_catalog AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- rto_tips
DROP POLICY IF EXISTS rto_tips_delete ON public.rto_tips;
CREATE POLICY rto_tips_delete ON public.rto_tips AS PERMISSIVE FOR DELETE TO public USING ((created_by = (SELECT auth.uid())));

DROP POLICY IF EXISTS rto_tips_insert ON public.rto_tips;
CREATE POLICY rto_tips_insert ON public.rto_tips AS PERMISSIVE FOR INSERT TO public WITH CHECK ((created_by = (SELECT auth.uid())));

DROP POLICY IF EXISTS rto_tips_update ON public.rto_tips;
CREATE POLICY rto_tips_update ON public.rto_tips AS PERMISSIVE FOR UPDATE TO public USING ((created_by = (SELECT auth.uid())));