-- P1-b Batch 04b: eos_ tables (eos_meeting_summaries → eos_workspaces)

DROP POLICY IF EXISTS eos_meeting_summaries_facilitator_insert ON public.eos_meeting_summaries;
CREATE POLICY eos_meeting_summaries_facilitator_insert ON public.eos_meeting_summaries AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_super_admin() OR has_meeting_role((SELECT auth.uid()), meeting_id, ARRAY['Leader'::text])));

DROP POLICY IF EXISTS eos_meeting_summaries_select ON public.eos_meeting_summaries;
CREATE POLICY eos_meeting_summaries_select ON public.eos_meeting_summaries AS PERMISSIVE FOR SELECT TO public USING ((is_super_admin() OR is_meeting_participant((SELECT auth.uid()), meeting_id) OR (EXISTS ( SELECT 1
   FROM (users u
     JOIN eos_meetings m ON ((m.client_id = u.client_id)))
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (m.id = eos_meeting_summaries.meeting_id) AND has_eos_role((SELECT auth.uid()), eos_meeting_summaries.tenant_id, 'client_viewer'::eos_role))))));

DROP POLICY IF EXISTS vivacity_delete_meetings ON public.eos_meetings;
CREATE POLICY vivacity_delete_meetings ON public.eos_meetings AS PERMISSIVE FOR DELETE TO authenticated USING ((is_vivacity_team_safe((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id_safe()))));

DROP POLICY IF EXISTS vivacity_insert_meetings ON public.eos_meetings;
CREATE POLICY vivacity_insert_meetings ON public.eos_meetings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_team_safe((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id_safe()))));

DROP POLICY IF EXISTS vivacity_select_meetings ON public.eos_meetings;
CREATE POLICY vivacity_select_meetings ON public.eos_meetings AS PERMISSIVE FOR SELECT TO authenticated USING ((is_vivacity_team_safe((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id_safe()))));

DROP POLICY IF EXISTS vivacity_update_meetings ON public.eos_meetings;
CREATE POLICY vivacity_update_meetings ON public.eos_meetings AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_vivacity_team_safe((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id_safe())))) WITH CHECK ((is_vivacity_team_safe((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id_safe()))));

DROP POLICY IF EXISTS eos_minutes_audit_log_tenant_select ON public.eos_minutes_audit_log;
CREATE POLICY eos_minutes_audit_log_tenant_select ON public.eos_minutes_audit_log AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = eos_minutes_audit_log.tenant_id) AND (tu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS users_insert_own_minutes_audit ON public.eos_minutes_audit_log;
CREATE POLICY users_insert_own_minutes_audit ON public.eos_minutes_audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS eos_process_audit_log_superadmin_all ON public.eos_process_audit_log;
CREATE POLICY eos_process_audit_log_superadmin_all ON public.eos_process_audit_log AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin((SELECT auth.uid()))) WITH CHECK (is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_process_versions_superadmin_all ON public.eos_process_versions;
CREATE POLICY eos_process_versions_superadmin_all ON public.eos_process_versions AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin((SELECT auth.uid()))) WITH CHECK (is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_processes_superadmin_all ON public.eos_processes;
CREATE POLICY eos_processes_superadmin_all ON public.eos_processes AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin((SELECT auth.uid()))) WITH CHECK (is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_qc_manage ON public.eos_qc;
CREATE POLICY eos_qc_manage ON public.eos_qc AS PERMISSIVE FOR ALL TO authenticated USING ((is_qc_admin_safe((SELECT auth.uid())) OR ((SELECT auth.uid()) = ANY (manager_ids)))) WITH CHECK ((is_qc_admin_safe((SELECT auth.uid())) OR ((SELECT auth.uid()) = ANY (manager_ids))));

DROP POLICY IF EXISTS eos_qc_select ON public.eos_qc;
CREATE POLICY eos_qc_select ON public.eos_qc AS PERMISSIVE FOR SELECT TO public USING ((is_qc_admin_safe((SELECT auth.uid())) OR (reviewee_id = (SELECT auth.uid())) OR ((SELECT auth.uid()) = ANY (manager_ids)) OR ((scope = 'tenant'::text) AND (tenant_id IS NOT NULL) AND (is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin()))));

DROP POLICY IF EXISTS qc_delete_tenant ON public.eos_qc;
CREATE POLICY qc_delete_tenant ON public.eos_qc AS PERMISSIVE FOR DELETE TO authenticated USING (((scope = 'tenant'::text) AND (tenant_id IS NOT NULL) AND (is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin())));

DROP POLICY IF EXISTS qc_insert_tenant ON public.eos_qc;
CREATE POLICY qc_insert_tenant ON public.eos_qc AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((scope = 'tenant'::text) AND (tenant_id IS NOT NULL) AND (((SELECT auth.uid()) = ANY (manager_ids)) OR is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin())));

DROP POLICY IF EXISTS qc_insert_vivacity ON public.eos_qc;
CREATE POLICY qc_insert_vivacity ON public.eos_qc AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((scope = 'vivacity'::text) AND is_vivacity_team_user((SELECT auth.uid())) AND (created_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS qc_update_tenant ON public.eos_qc;
CREATE POLICY qc_update_tenant ON public.eos_qc AS PERMISSIVE FOR UPDATE TO authenticated USING (((scope = 'tenant'::text) AND (tenant_id IS NOT NULL) AND ((reviewee_id = (SELECT auth.uid())) OR ((SELECT auth.uid()) = ANY (manager_ids)) OR is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin()))) WITH CHECK (((scope = 'tenant'::text) AND (tenant_id IS NOT NULL)));

DROP POLICY IF EXISTS qc_update_vivacity ON public.eos_qc;
CREATE POLICY qc_update_vivacity ON public.eos_qc AS PERMISSIVE FOR UPDATE TO authenticated USING (((scope = 'vivacity'::text) AND is_vivacity_team_user((SELECT auth.uid())) AND ((reviewee_id = (SELECT auth.uid())) OR ((SELECT auth.uid()) = ANY (manager_ids)) OR is_super_admin()))) WITH CHECK (((scope = 'vivacity'::text) AND is_vivacity_team_user((SELECT auth.uid()))));

DROP POLICY IF EXISTS eos_qc_answers_superadmin_all ON public.eos_qc_answers;
CREATE POLICY eos_qc_answers_superadmin_all ON public.eos_qc_answers AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin((SELECT auth.uid()))) WITH CHECK (is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS qc_answers_delete ON public.eos_qc_answers;
CREATE POLICY qc_answers_delete ON public.eos_qc_answers AS PERMISSIVE FOR DELETE TO public USING ((can_access_qc((SELECT auth.uid()), qc_id) AND (NOT is_qc_signed(qc_id))));

DROP POLICY IF EXISTS qc_answers_insert ON public.eos_qc_answers;
CREATE POLICY qc_answers_insert ON public.eos_qc_answers AS PERMISSIVE FOR INSERT TO public WITH CHECK ((can_access_qc((SELECT auth.uid()), qc_id) AND (NOT is_qc_signed(qc_id))));

DROP POLICY IF EXISTS qc_answers_select ON public.eos_qc_answers;
CREATE POLICY qc_answers_select ON public.eos_qc_answers AS PERMISSIVE FOR SELECT TO public USING (can_access_qc((SELECT auth.uid()), qc_id));

DROP POLICY IF EXISTS qc_answers_update ON public.eos_qc_answers;
CREATE POLICY qc_answers_update ON public.eos_qc_answers AS PERMISSIVE FOR UPDATE TO public USING ((can_access_qc((SELECT auth.uid()), qc_id) AND (NOT is_qc_signed(qc_id))));

DROP POLICY IF EXISTS qc_attachments_insert ON public.eos_qc_attachments;
CREATE POLICY qc_attachments_insert ON public.eos_qc_attachments AS PERMISSIVE FOR INSERT TO public WITH CHECK (can_access_qc((SELECT auth.uid()), qc_id));

DROP POLICY IF EXISTS qc_attachments_select ON public.eos_qc_attachments;
CREATE POLICY qc_attachments_select ON public.eos_qc_attachments AS PERMISSIVE FOR SELECT TO public USING (can_access_qc((SELECT auth.uid()), qc_id));

DROP POLICY IF EXISTS eos_qc_fit_superadmin_all ON public.eos_qc_fit;
CREATE POLICY eos_qc_fit_superadmin_all ON public.eos_qc_fit AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin((SELECT auth.uid()))) WITH CHECK (is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS qc_fit_insert ON public.eos_qc_fit;
CREATE POLICY qc_fit_insert ON public.eos_qc_fit AS PERMISSIVE FOR INSERT TO public WITH CHECK ((can_access_qc((SELECT auth.uid()), qc_id) AND (NOT is_qc_signed(qc_id))));

DROP POLICY IF EXISTS qc_fit_select ON public.eos_qc_fit;
CREATE POLICY qc_fit_select ON public.eos_qc_fit AS PERMISSIVE FOR SELECT TO public USING (can_access_qc((SELECT auth.uid()), qc_id));

DROP POLICY IF EXISTS qc_fit_update ON public.eos_qc_fit;
CREATE POLICY qc_fit_update ON public.eos_qc_fit AS PERMISSIVE FOR UPDATE TO public USING ((can_access_qc((SELECT auth.uid()), qc_id) AND (NOT is_qc_signed(qc_id))));

DROP POLICY IF EXISTS eos_qc_links_superadmin_all ON public.eos_qc_links;
CREATE POLICY eos_qc_links_superadmin_all ON public.eos_qc_links AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin((SELECT auth.uid()))) WITH CHECK (is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS qc_links_delete ON public.eos_qc_links;
CREATE POLICY qc_links_delete ON public.eos_qc_links AS PERMISSIVE FOR DELETE TO public USING (can_access_qc((SELECT auth.uid()), qc_id));

DROP POLICY IF EXISTS qc_links_insert ON public.eos_qc_links;
CREATE POLICY qc_links_insert ON public.eos_qc_links AS PERMISSIVE FOR INSERT TO public WITH CHECK (can_access_qc((SELECT auth.uid()), qc_id));

DROP POLICY IF EXISTS qc_links_select ON public.eos_qc_links;
CREATE POLICY qc_links_select ON public.eos_qc_links AS PERMISSIVE FOR SELECT TO public USING (can_access_qc((SELECT auth.uid()), qc_id));

DROP POLICY IF EXISTS eos_qc_signoffs_superadmin_all ON public.eos_qc_signoffs;
CREATE POLICY eos_qc_signoffs_superadmin_all ON public.eos_qc_signoffs AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin((SELECT auth.uid()))) WITH CHECK (is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS qc_signoffs_insert ON public.eos_qc_signoffs;
CREATE POLICY qc_signoffs_insert ON public.eos_qc_signoffs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((can_access_qc((SELECT auth.uid()), qc_id) AND (signed_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS qc_signoffs_select ON public.eos_qc_signoffs;
CREATE POLICY qc_signoffs_select ON public.eos_qc_signoffs AS PERMISSIVE FOR SELECT TO public USING (can_access_qc((SELECT auth.uid()), qc_id));

DROP POLICY IF EXISTS qc_templates_delete ON public.eos_qc_templates;
CREATE POLICY qc_templates_delete ON public.eos_qc_templates AS PERMISSIVE FOR DELETE TO public USING ((((tenant_id = get_current_user_tenant()) AND is_eos_admin((SELECT auth.uid()), tenant_id)) OR is_super_admin()));

DROP POLICY IF EXISTS qc_templates_insert ON public.eos_qc_templates;
CREATE POLICY qc_templates_insert ON public.eos_qc_templates AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((tenant_id = get_current_user_tenant()) AND is_eos_admin((SELECT auth.uid()), tenant_id)) OR is_super_admin()));

DROP POLICY IF EXISTS qc_templates_select ON public.eos_qc_templates;
CREATE POLICY qc_templates_select ON public.eos_qc_templates AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = get_current_user_tenant()) OR is_super_admin() OR is_vivacity_team_user((SELECT auth.uid()))));

DROP POLICY IF EXISTS qc_templates_update ON public.eos_qc_templates;
CREATE POLICY qc_templates_update ON public.eos_qc_templates AS PERMISSIVE FOR UPDATE TO public USING ((((tenant_id = get_current_user_tenant()) AND is_eos_admin((SELECT auth.uid()), tenant_id)) OR is_super_admin()));

DROP POLICY IF EXISTS eos_rocks_client_viewer_select ON public.eos_rocks;
CREATE POLICY eos_rocks_client_viewer_select ON public.eos_rocks AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe((client_id)::bigint, (SELECT auth.uid())));

DROP POLICY IF EXISTS eos_rocks_select ON public.eos_rocks;
CREATE POLICY eos_rocks_select ON public.eos_rocks AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_user((SELECT auth.uid())) OR is_super_admin() OR has_any_eos_role((SELECT auth.uid()), tenant_id) OR (tenant_id = get_current_user_tenant())));

DROP POLICY IF EXISTS eos_rocks_update ON public.eos_rocks;
CREATE POLICY eos_rocks_update ON public.eos_rocks AS PERMISSIVE FOR UPDATE TO public USING ((is_super_admin() OR (tenant_id = get_current_user_tenant()) OR (owner_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS eos_rocks_users_all ON public.eos_rocks;
CREATE POLICY eos_rocks_users_all ON public.eos_rocks AS PERMISSIVE FOR ALL TO public USING ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin())) WITH CHECK ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS eos_rocks_vivacity_delete ON public.eos_rocks;
CREATE POLICY eos_rocks_vivacity_delete ON public.eos_rocks AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_rocks_vivacity_insert ON public.eos_rocks;
CREATE POLICY eos_rocks_vivacity_insert ON public.eos_rocks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_team_user((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id()))));

DROP POLICY IF EXISTS eos_rocks_vivacity_update ON public.eos_rocks;
CREATE POLICY eos_rocks_vivacity_update ON public.eos_rocks AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_scorecard_admin_all ON public.eos_scorecard;
CREATE POLICY eos_scorecard_admin_all ON public.eos_scorecard AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin() OR is_vivacity_team_safe((SELECT auth.uid())) OR ((tenant_id = get_current_user_tenant()) AND (get_current_user_role() = 'Admin'::text)))) WITH CHECK ((is_super_admin() OR is_vivacity_team_safe((SELECT auth.uid())) OR ((tenant_id = get_current_user_tenant()) AND (get_current_user_role() = 'Admin'::text))));

DROP POLICY IF EXISTS eos_scorecard_entries_select ON public.eos_scorecard_entries;
CREATE POLICY eos_scorecard_entries_select ON public.eos_scorecard_entries AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_user((SELECT auth.uid())) OR has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS eos_scorecard_entries_users_insert ON public.eos_scorecard_entries;
CREATE POLICY eos_scorecard_entries_users_insert ON public.eos_scorecard_entries AS PERMISSIVE FOR INSERT TO public WITH CHECK ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS eos_scorecard_entries_users_update ON public.eos_scorecard_entries;
CREATE POLICY eos_scorecard_entries_users_update ON public.eos_scorecard_entries AS PERMISSIVE FOR UPDATE TO public USING ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin())) WITH CHECK ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS eos_scorecard_entries_vivacity_delete ON public.eos_scorecard_entries;
CREATE POLICY eos_scorecard_entries_vivacity_delete ON public.eos_scorecard_entries AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_scorecard_entries_vivacity_insert ON public.eos_scorecard_entries;
CREATE POLICY eos_scorecard_entries_vivacity_insert ON public.eos_scorecard_entries AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_team_user((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id()))));

DROP POLICY IF EXISTS eos_scorecard_entries_vivacity_update ON public.eos_scorecard_entries;
CREATE POLICY eos_scorecard_entries_vivacity_update ON public.eos_scorecard_entries AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_scorecard_metrics_admin_all ON public.eos_scorecard_metrics;
CREATE POLICY eos_scorecard_metrics_admin_all ON public.eos_scorecard_metrics AS PERMISSIVE FOR ALL TO public USING ((can_facilitate_eos((SELECT auth.uid()), tenant_id) OR is_super_admin())) WITH CHECK ((can_facilitate_eos((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS eos_scorecard_metrics_select ON public.eos_scorecard_metrics;
CREATE POLICY eos_scorecard_metrics_select ON public.eos_scorecard_metrics AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_user((SELECT auth.uid())) OR is_super_admin() OR has_any_eos_role((SELECT auth.uid()), tenant_id) OR (EXISTS ( SELECT 1
   FROM eos_scorecard sc
  WHERE ((sc.id = eos_scorecard_metrics.scorecard_id) AND (sc.tenant_id = get_current_user_tenant()))))));

DROP POLICY IF EXISTS eos_scorecard_metrics_vivacity_delete ON public.eos_scorecard_metrics;
CREATE POLICY eos_scorecard_metrics_vivacity_delete ON public.eos_scorecard_metrics AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_scorecard_metrics_vivacity_insert ON public.eos_scorecard_metrics;
CREATE POLICY eos_scorecard_metrics_vivacity_insert ON public.eos_scorecard_metrics AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_team_user((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id()))));

DROP POLICY IF EXISTS eos_scorecard_metrics_vivacity_update ON public.eos_scorecard_metrics;
CREATE POLICY eos_scorecard_metrics_vivacity_update ON public.eos_scorecard_metrics AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_template_audit_log_authenticated_insert ON public.eos_template_audit_log;
CREATE POLICY eos_template_audit_log_authenticated_insert ON public.eos_template_audit_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS eos_template_audit_log_tenant_select ON public.eos_template_audit_log;
CREATE POLICY eos_template_audit_log_tenant_select ON public.eos_template_audit_log AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.tenant_id = eos_template_audit_log.tenant_id)))));

DROP POLICY IF EXISTS eos_todos_select ON public.eos_todos;
CREATE POLICY eos_todos_select ON public.eos_todos AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_user((SELECT auth.uid())) OR is_super_admin() OR has_any_eos_role((SELECT auth.uid()), tenant_id) OR (tenant_id = get_current_user_tenant()) OR (assigned_to = (SELECT auth.uid()))));

DROP POLICY IF EXISTS eos_todos_update ON public.eos_todos;
CREATE POLICY eos_todos_update ON public.eos_todos AS PERMISSIVE FOR UPDATE TO public USING ((is_super_admin() OR (tenant_id = get_current_user_tenant()) OR (assigned_to = (SELECT auth.uid()))));

DROP POLICY IF EXISTS eos_todos_users_all ON public.eos_todos;
CREATE POLICY eos_todos_users_all ON public.eos_todos AS PERMISSIVE FOR ALL TO public USING ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin())) WITH CHECK ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS eos_todos_vivacity_delete ON public.eos_todos;
CREATE POLICY eos_todos_vivacity_delete ON public.eos_todos AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_todos_vivacity_insert ON public.eos_todos;
CREATE POLICY eos_todos_vivacity_insert ON public.eos_todos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_team_user((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id()))));

DROP POLICY IF EXISTS eos_todos_vivacity_update ON public.eos_todos;
CREATE POLICY eos_todos_vivacity_update ON public.eos_todos AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_user_roles_select ON public.eos_user_roles;
CREATE POLICY eos_user_roles_select ON public.eos_user_roles AS PERMISSIVE FOR SELECT TO public USING (((user_id = (SELECT auth.uid())) OR is_super_admin()));

DROP POLICY IF EXISTS eos_user_roles_superadmin_all ON public.eos_user_roles;
CREATE POLICY eos_user_roles_superadmin_all ON public.eos_user_roles AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.global_role = 'Super Admin'::text)))));

DROP POLICY IF EXISTS eos_vto_admin_all ON public.eos_vto;
CREATE POLICY eos_vto_admin_all ON public.eos_vto AS PERMISSIVE FOR ALL TO public USING ((is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin())) WITH CHECK ((is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS eos_vto_select ON public.eos_vto;
CREATE POLICY eos_vto_select ON public.eos_vto AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_user((SELECT auth.uid())) OR has_any_eos_role((SELECT auth.uid()), tenant_id) OR (tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS eos_vto_superadmin_all ON public.eos_vto;
CREATE POLICY eos_vto_superadmin_all ON public.eos_vto AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin((SELECT auth.uid()))) WITH CHECK (is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_vto_vivacity_delete ON public.eos_vto;
CREATE POLICY eos_vto_vivacity_delete ON public.eos_vto AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_vto_vivacity_insert ON public.eos_vto;
CREATE POLICY eos_vto_vivacity_insert ON public.eos_vto AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_team_user((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id()))));

DROP POLICY IF EXISTS eos_vto_vivacity_update ON public.eos_vto;
CREATE POLICY eos_vto_vivacity_update ON public.eos_vto AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS vto_drafts_insert ON public.eos_vto_drafts;
CREATE POLICY vto_drafts_insert ON public.eos_vto_drafts AS PERMISSIVE FOR INSERT TO public WITH CHECK (((tenant_id = get_current_user_tenant()) AND (is_meeting_participant((SELECT auth.uid()), meeting_id) OR is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin())));

DROP POLICY IF EXISTS vto_drafts_select ON public.eos_vto_drafts;
CREATE POLICY vto_drafts_select ON public.eos_vto_drafts AS PERMISSIVE FOR SELECT TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND (is_meeting_participant((SELECT auth.uid()), meeting_id) OR is_eos_admin((SELECT auth.uid()), tenant_id)))));

DROP POLICY IF EXISTS vto_drafts_update ON public.eos_vto_drafts;
CREATE POLICY vto_drafts_update ON public.eos_vto_drafts AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id = get_current_user_tenant()) AND (is_meeting_participant((SELECT auth.uid()), meeting_id) OR is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin())));

DROP POLICY IF EXISTS eos_vto_versions_admin_all ON public.eos_vto_versions;
CREATE POLICY eos_vto_versions_admin_all ON public.eos_vto_versions AS PERMISSIVE FOR ALL TO public USING ((is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin())) WITH CHECK ((is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS eos_vto_versions_users_select ON public.eos_vto_versions;
CREATE POLICY eos_vto_versions_users_select ON public.eos_vto_versions AS PERMISSIVE FOR SELECT TO public USING ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS eos_workspaces_manage ON public.eos_workspaces;
CREATE POLICY eos_workspaces_manage ON public.eos_workspaces AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_workspaces_vivacity_select ON public.eos_workspaces;
CREATE POLICY eos_workspaces_vivacity_select ON public.eos_workspaces AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_user((SELECT auth.uid())));