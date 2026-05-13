-- P1-b Batch E1: auth.uid() → (SELECT auth.uid()) hardening
-- 54 policies, 18 tables (e% < 'eos_m')

DROP POLICY IF EXISTS "email_automation_log_tenant_select" ON public.email_automation_log;
CREATE POLICY "email_automation_log_tenant_select" ON public.email_automation_log AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "staff_insert_automation_logs" ON public.email_automation_log;
CREATE POLICY "staff_insert_automation_logs" ON public.email_automation_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "staff_update_automation_logs" ON public.email_automation_log;
CREATE POLICY "staff_update_automation_logs" ON public.email_automation_log AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "email_link_audit_select_own" ON public.email_link_audit;
CREATE POLICY "email_link_audit_select_own" ON public.email_link_audit AS PERMISSIVE FOR SELECT TO public USING ((user_uuid = (SELECT auth.uid())));

DROP POLICY IF EXISTS "staff_insert_email_link_audit" ON public.email_link_audit;
CREATE POLICY "staff_insert_email_link_audit" ON public.email_link_audit AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "email_message_attachments_delete" ON public.email_message_attachments;
CREATE POLICY "email_message_attachments_delete" ON public.email_message_attachments AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "email_message_attachments_insert" ON public.email_message_attachments;
CREATE POLICY "email_message_attachments_insert" ON public.email_message_attachments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM email_messages em
  WHERE ((em.id = email_message_attachments.email_message_id) AND (em.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "email_message_attachments_select" ON public.email_message_attachments;
CREATE POLICY "email_message_attachments_select" ON public.email_message_attachments AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM email_messages em
  WHERE ((em.id = email_message_attachments.email_message_id) AND (em.user_uuid = (SELECT auth.uid()))))) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "email_message_attachments_update" ON public.email_message_attachments;
CREATE POLICY "email_message_attachments_update" ON public.email_message_attachments AS PERMISSIVE FOR UPDATE TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "email_messages_delete" ON public.email_messages;
CREATE POLICY "email_messages_delete" ON public.email_messages AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "email_messages_insert" ON public.email_messages;
CREATE POLICY "email_messages_insert" ON public.email_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_uuid = (SELECT auth.uid())) AND is_vivacity_team_safe((SELECT auth.uid())) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS "email_messages_select" ON public.email_messages;
CREATE POLICY "email_messages_select" ON public.email_messages AS PERMISSIVE FOR SELECT TO authenticated USING (((user_uuid = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "email_messages_update" ON public.email_messages;
CREATE POLICY "email_messages_update" ON public.email_messages AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_uuid = (SELECT auth.uid()))) WITH CHECK ((user_uuid = (SELECT auth.uid())));

DROP POLICY IF EXISTS "email_send_log_superadmin_all" ON public.email_send_log;
CREATE POLICY "email_send_log_superadmin_all" ON public.email_send_log AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS "email_templates_manage" ON public.email_templates;
CREATE POLICY "email_templates_manage" ON public.email_templates AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "email_templates_select" ON public.email_templates;
CREATE POLICY "email_templates_select" ON public.email_templates AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "engagement_audit_log_authenticated_insert" ON public.engagement_audit_log;
CREATE POLICY "engagement_audit_log_authenticated_insert" ON public.engagement_audit_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "engagement_audit_log_tenant_select" ON public.engagement_audit_log;
CREATE POLICY "engagement_audit_log_tenant_select" ON public.engagement_audit_log AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "eos_accountability_chart_admin_all" ON public.eos_accountability_chart;
CREATE POLICY "eos_accountability_chart_admin_all" ON public.eos_accountability_chart AS PERMISSIVE FOR ALL TO public USING ((is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin())) WITH CHECK ((is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS "eos_accountability_chart_select" ON public.eos_accountability_chart;
CREATE POLICY "eos_accountability_chart_select" ON public.eos_accountability_chart AS PERMISSIVE FOR SELECT TO public USING ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin() OR (tenant_id = get_current_user_tenant())));

DROP POLICY IF EXISTS "eos_agenda_template_versions_admin_insert" ON public.eos_agenda_template_versions;
CREATE POLICY "eos_agenda_template_versions_admin_insert" ON public.eos_agenda_template_versions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM (eos_agenda_templates t
     JOIN users u ON ((u.tenant_id = t.tenant_id)))
  WHERE ((t.id = eos_agenda_template_versions.template_id) AND (u.user_uuid = (SELECT auth.uid())) AND (u.user_type = ANY (ARRAY['Vivacity'::user_type_enum, 'Client'::user_type_enum, 'Vivacity Team'::user_type_enum])))))));

DROP POLICY IF EXISTS "eos_agenda_template_versions_admin_update" ON public.eos_agenda_template_versions;
CREATE POLICY "eos_agenda_template_versions_admin_update" ON public.eos_agenda_template_versions AS PERMISSIVE FOR UPDATE TO public USING ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM (eos_agenda_templates t
     JOIN users u ON ((u.tenant_id = t.tenant_id)))
  WHERE ((t.id = eos_agenda_template_versions.template_id) AND (u.user_uuid = (SELECT auth.uid())) AND (u.user_type = ANY (ARRAY['Vivacity'::user_type_enum, 'Client'::user_type_enum, 'Vivacity Team'::user_type_enum])))))));

DROP POLICY IF EXISTS "eos_agenda_template_versions_tenant_select" ON public.eos_agenda_template_versions;
CREATE POLICY "eos_agenda_template_versions_tenant_select" ON public.eos_agenda_template_versions AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (eos_agenda_templates t
     JOIN users u ON ((u.tenant_id = t.tenant_id)))
  WHERE ((t.id = eos_agenda_template_versions.template_id) AND (u.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "eos_agenda_templates_admin_all" ON public.eos_agenda_templates;
CREATE POLICY "eos_agenda_templates_admin_all" ON public.eos_agenda_templates AS PERMISSIVE FOR ALL TO public USING ((is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin())) WITH CHECK ((is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS "eos_agenda_templates_select" ON public.eos_agenda_templates;
CREATE POLICY "eos_agenda_templates_select" ON public.eos_agenda_templates AS PERMISSIVE FOR SELECT TO public USING ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin() OR (tenant_id = get_current_user_tenant())));

DROP POLICY IF EXISTS "eos_alerts_admin_update" ON public.eos_alerts;
CREATE POLICY "eos_alerts_admin_update" ON public.eos_alerts AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND ((users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role])) OR (users.tenant_role = 'Admin'::text))))));

DROP POLICY IF EXISTS "eos_alerts_authenticated_insert" ON public.eos_alerts;
CREATE POLICY "eos_alerts_authenticated_insert" ON public.eos_alerts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role])))))));

DROP POLICY IF EXISTS "eos_alerts_select" ON public.eos_alerts;
CREATE POLICY "eos_alerts_select" ON public.eos_alerts AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_user((SELECT auth.uid())) OR (tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "chart_drafts_insert" ON public.eos_chart_drafts;
CREATE POLICY "chart_drafts_insert" ON public.eos_chart_drafts AS PERMISSIVE FOR INSERT TO public WITH CHECK (((tenant_id = get_current_user_tenant()) AND (is_meeting_participant((SELECT auth.uid()), meeting_id) OR is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin())));

DROP POLICY IF EXISTS "chart_drafts_select" ON public.eos_chart_drafts;
CREATE POLICY "chart_drafts_select" ON public.eos_chart_drafts AS PERMISSIVE FOR SELECT TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND (is_meeting_participant((SELECT auth.uid()), meeting_id) OR is_eos_admin((SELECT auth.uid()), tenant_id)))));

DROP POLICY IF EXISTS "chart_drafts_update" ON public.eos_chart_drafts;
CREATE POLICY "chart_drafts_update" ON public.eos_chart_drafts AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id = get_current_user_tenant()) AND (is_meeting_participant((SELECT auth.uid()), meeting_id) OR is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin())));

DROP POLICY IF EXISTS "eos_flight_plans_admin_all" ON public.eos_flight_plans;
CREATE POLICY "eos_flight_plans_admin_all" ON public.eos_flight_plans AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Admin'::unicorn_role]))))));

DROP POLICY IF EXISTS "eos_flight_plans_superadmin_all" ON public.eos_flight_plans;
CREATE POLICY "eos_flight_plans_superadmin_all" ON public.eos_flight_plans AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS "eos_flight_plans_tenant_select" ON public.eos_flight_plans;
CREATE POLICY "eos_flight_plans_tenant_select" ON public.eos_flight_plans AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "eos_function_team_members_vivacity_all" ON public.eos_function_team_members;
CREATE POLICY "eos_function_team_members_vivacity_all" ON public.eos_function_team_members AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role])) AND (u.archived = false))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role])) AND (u.archived = false)))));

DROP POLICY IF EXISTS "eos_headlines_client_viewer_select" ON public.eos_headlines;
CREATE POLICY "eos_headlines_client_viewer_select" ON public.eos_headlines AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (users u
     JOIN eos_meetings m ON ((m.client_id = u.client_id)))
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (m.id = eos_headlines.meeting_id) AND has_eos_role((SELECT auth.uid()), m.tenant_id, 'client_viewer'::eos_role)))));

DROP POLICY IF EXISTS "eos_headlines_delete" ON public.eos_headlines;
CREATE POLICY "eos_headlines_delete" ON public.eos_headlines AS PERMISSIVE FOR DELETE TO public USING ((is_super_admin() OR (user_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "eos_headlines_insert" ON public.eos_headlines;
CREATE POLICY "eos_headlines_insert" ON public.eos_headlines AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM eos_meetings m
  WHERE ((m.id = eos_headlines.meeting_id) AND ((m.tenant_id = get_current_user_tenant()) OR is_meeting_participant((SELECT auth.uid()), eos_headlines.meeting_id)))))));

DROP POLICY IF EXISTS "eos_headlines_select" ON public.eos_headlines;
CREATE POLICY "eos_headlines_select" ON public.eos_headlines AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_user((SELECT auth.uid())) OR is_super_admin() OR is_meeting_participant((SELECT auth.uid()), meeting_id)));

DROP POLICY IF EXISTS "eos_headlines_update" ON public.eos_headlines;
CREATE POLICY "eos_headlines_update" ON public.eos_headlines AS PERMISSIVE FOR UPDATE TO public USING ((is_super_admin() OR (user_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "eos_headlines_vivacity_delete" ON public.eos_headlines;
CREATE POLICY "eos_headlines_vivacity_delete" ON public.eos_headlines AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS "eos_headlines_vivacity_insert" ON public.eos_headlines;
CREATE POLICY "eos_headlines_vivacity_insert" ON public.eos_headlines AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_team_user((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id()))));

DROP POLICY IF EXISTS "eos_headlines_vivacity_update" ON public.eos_headlines;
CREATE POLICY "eos_headlines_vivacity_update" ON public.eos_headlines AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS "eos_health_snapshots_select" ON public.eos_health_snapshots;
CREATE POLICY "eos_health_snapshots_select" ON public.eos_health_snapshots AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_user((SELECT auth.uid())) OR (tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "eos_health_snapshots_system_insert" ON public.eos_health_snapshots;
CREATE POLICY "eos_health_snapshots_system_insert" ON public.eos_health_snapshots AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role]))))));

DROP POLICY IF EXISTS "eos_issues_client_viewer_select" ON public.eos_issues;
CREATE POLICY "eos_issues_client_viewer_select" ON public.eos_issues AS PERMISSIVE FOR SELECT TO public USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.client_id = eos_issues.client_id) AND has_eos_role((SELECT auth.uid()), eos_issues.tenant_id, 'client_viewer'::eos_role))))));

DROP POLICY IF EXISTS "eos_issues_select" ON public.eos_issues;
CREATE POLICY "eos_issues_select" ON public.eos_issues AS PERMISSIVE FOR SELECT TO public USING (((deleted_at IS NULL) AND (is_vivacity_team_user((SELECT auth.uid())) OR is_super_admin() OR has_any_eos_role((SELECT auth.uid()), tenant_id) OR (tenant_id = get_current_user_tenant()))));

DROP POLICY IF EXISTS "eos_issues_update" ON public.eos_issues;
CREATE POLICY "eos_issues_update" ON public.eos_issues AS PERMISSIVE FOR UPDATE TO public USING ((is_staff() OR is_super_admin() OR (tenant_id = get_current_user_tenant()) OR (assigned_to = (SELECT auth.uid())) OR (created_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "eos_issues_users_all" ON public.eos_issues;
CREATE POLICY "eos_issues_users_all" ON public.eos_issues AS PERMISSIVE FOR ALL TO public USING ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin())) WITH CHECK ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS "eos_issues_vivacity_delete" ON public.eos_issues;
CREATE POLICY "eos_issues_vivacity_delete" ON public.eos_issues AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS "eos_issues_vivacity_insert" ON public.eos_issues;
CREATE POLICY "eos_issues_vivacity_insert" ON public.eos_issues AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_team_user((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id()))));

DROP POLICY IF EXISTS "eos_issues_vivacity_update" ON public.eos_issues;
CREATE POLICY "eos_issues_vivacity_update" ON public.eos_issues AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS "eos_item_clients_manage" ON public.eos_item_clients;
CREATE POLICY "eos_item_clients_manage" ON public.eos_item_clients AS PERMISSIVE FOR ALL TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND has_any_eos_role((SELECT auth.uid()), tenant_id))));

DROP POLICY IF EXISTS "eos_item_clients_select" ON public.eos_item_clients;
CREATE POLICY "eos_item_clients_select" ON public.eos_item_clients AS PERMISSIVE FOR SELECT TO public USING ((is_super_admin() OR (tenant_id = get_current_user_tenant()) OR (client_id = ( SELECT users.client_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid()))))));