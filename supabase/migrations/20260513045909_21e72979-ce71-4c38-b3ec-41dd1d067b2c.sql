-- P1-b Batch C2: auth.uid() → (SELECT auth.uid()) hardening
-- 58 policies, 23 tables (c% >= 'co')
-- Pure performance hardening — zero access rule changes

DROP POLICY IF EXISTS "compliance_responses_access" ON public.compliance_audit_responses;
CREATE POLICY "compliance_responses_access" ON public.compliance_audit_responses AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (compliance_audits ca
     JOIN users u ON ((u.user_uuid = (SELECT auth.uid()))))
  WHERE ((ca.id = compliance_audit_responses.audit_id) AND ((u.is_vivacity_internal = true) OR (u.global_role = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.tenant_id = ca.tenant_id))))));

DROP POLICY IF EXISTS "compliance_audits_access" ON public.compliance_audits;
CREATE POLICY "compliance_audits_access" ON public.compliance_audits AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((u.is_vivacity_internal = true) OR (u.global_role = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.tenant_id = compliance_audits.tenant_id))))));

DROP POLICY IF EXISTS "compliance_caa_access" ON public.compliance_corrective_actions;
CREATE POLICY "compliance_caa_access" ON public.compliance_corrective_actions AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (compliance_audits ca
     JOIN users u ON ((u.user_uuid = (SELECT auth.uid()))))
  WHERE ((ca.id = compliance_corrective_actions.audit_id) AND ((u.is_vivacity_internal = true) OR (u.global_role = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.tenant_id = ca.tenant_id))))));

DROP POLICY IF EXISTS "compliance_pack_exports_admin_insert" ON public.compliance_pack_exports;
CREATE POLICY "compliance_pack_exports_admin_insert" ON public.compliance_pack_exports AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Admin'::unicorn_role]))))));

DROP POLICY IF EXISTS "compliance_pack_exports_admin_select" ON public.compliance_pack_exports;
CREATE POLICY "compliance_pack_exports_admin_select" ON public.compliance_pack_exports AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Admin'::unicorn_role]))))));

DROP POLICY IF EXISTS "compliance_pack_exports_admin_update_own" ON public.compliance_pack_exports;
CREATE POLICY "compliance_pack_exports_admin_update_own" ON public.compliance_pack_exports AS PERMISSIVE FOR UPDATE TO public USING (((requested_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = 'Super Admin'::unicorn_role))))));

DROP POLICY IF EXISTS "compliance_plans_superadmin_all" ON public.compliance_plans;
CREATE POLICY "compliance_plans_superadmin_all" ON public.compliance_plans AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS "compliance_plans_vivacity_select" ON public.compliance_plans;
CREATE POLICY "compliance_plans_vivacity_select" ON public.compliance_plans AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS "playbooks_vivacity_insert" ON public.compliance_playbooks;
CREATE POLICY "playbooks_vivacity_insert" ON public.compliance_playbooks AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "playbooks_vivacity_select" ON public.compliance_playbooks;
CREATE POLICY "playbooks_vivacity_select" ON public.compliance_playbooks AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "playbooks_vivacity_update" ON public.compliance_playbooks;
CREATE POLICY "playbooks_vivacity_update" ON public.compliance_playbooks AS PERMISSIVE FOR UPDATE TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "compliance_score_snapshots_authenticated_insert" ON public.compliance_score_snapshots;
CREATE POLICY "compliance_score_snapshots_authenticated_insert" ON public.compliance_score_snapshots AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "compliance_score_snapshots_tenant_select" ON public.compliance_score_snapshots;
CREATE POLICY "compliance_score_snapshots_tenant_select" ON public.compliance_score_snapshots AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "ctd_staff_delete" ON public.compliance_task_definitions;
CREATE POLICY "ctd_staff_delete" ON public.compliance_task_definitions AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "ctd_staff_insert" ON public.compliance_task_definitions;
CREATE POLICY "ctd_staff_insert" ON public.compliance_task_definitions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "ctd_staff_select" ON public.compliance_task_definitions;
CREATE POLICY "ctd_staff_select" ON public.compliance_task_definitions AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "ctd_staff_update" ON public.compliance_task_definitions;
CREATE POLICY "ctd_staff_update" ON public.compliance_task_definitions AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_staff((SELECT auth.uid()))) WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "cti_staff_insert" ON public.compliance_task_instances;
CREATE POLICY "cti_staff_insert" ON public.compliance_task_instances AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id)));

DROP POLICY IF EXISTS "cti_staff_select" ON public.compliance_task_instances;
CREATE POLICY "cti_staff_select" ON public.compliance_task_instances AS PERMISSIVE FOR SELECT TO authenticated USING ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id)));

DROP POLICY IF EXISTS "cti_staff_update" ON public.compliance_task_instances;
CREATE POLICY "cti_staff_update" ON public.compliance_task_instances AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id))) WITH CHECK ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id)));

DROP POLICY IF EXISTS "ctr_staff_delete" ON public.compliance_task_requirements;
CREATE POLICY "ctr_staff_delete" ON public.compliance_task_requirements AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "ctr_staff_insert" ON public.compliance_task_requirements;
CREATE POLICY "ctr_staff_insert" ON public.compliance_task_requirements AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "ctr_staff_select" ON public.compliance_task_requirements;
CREATE POLICY "ctr_staff_select" ON public.compliance_task_requirements AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "ctr_staff_update" ON public.compliance_task_requirements;
CREATE POLICY "ctr_staff_update" ON public.compliance_task_requirements AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_staff((SELECT auth.uid()))) WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "compliance_questions_read" ON public.compliance_template_questions;
CREATE POLICY "compliance_questions_read" ON public.compliance_template_questions AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM (compliance_template_sections s
     JOIN compliance_templates t ON ((t.id = s.template_id)))
  WHERE ((s.id = compliance_template_questions.section_id) AND ((t.tenant_id IS NULL) OR has_tenant_access_safe(t.tenant_id, (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "compliance_sections_read" ON public.compliance_template_sections;
CREATE POLICY "compliance_sections_read" ON public.compliance_template_sections AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM compliance_templates t
  WHERE ((t.id = compliance_template_sections.template_id) AND ((t.tenant_id IS NULL) OR has_tenant_access_safe(t.tenant_id, (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "compliance_templates_manage" ON public.compliance_templates;
CREATE POLICY "compliance_templates_manage" ON public.compliance_templates AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((u.global_role = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

DROP POLICY IF EXISTS "compliance_templates_read" ON public.compliance_templates;
CREATE POLICY "compliance_templates_read" ON public.compliance_templates AS PERMISSIVE FOR SELECT TO public USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE (u.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "connected_tenants_select" ON public.connected_tenants;
CREATE POLICY "connected_tenants_select" ON public.connected_tenants AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin() OR (user_uuid = (SELECT auth.uid())) OR user_in_tenant(tenant_id)));

DROP POLICY IF EXISTS "connected_tenants_users_delete_own" ON public.connected_tenants;
CREATE POLICY "connected_tenants_users_delete_own" ON public.connected_tenants AS PERMISSIVE FOR DELETE TO public USING (((SELECT auth.uid()) = user_uuid));

DROP POLICY IF EXISTS "connected_tenants_users_insert_own" ON public.connected_tenants;
CREATE POLICY "connected_tenants_users_insert_own" ON public.connected_tenants AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_uuid));

DROP POLICY IF EXISTS "connected_tenants_users_select_own" ON public.connected_tenants;
CREATE POLICY "connected_tenants_users_select_own" ON public.connected_tenants AS PERMISSIVE FOR SELECT TO public USING (((SELECT auth.uid()) = user_uuid));

DROP POLICY IF EXISTS "connected_tenants_users_update_own" ON public.connected_tenants;
CREATE POLICY "connected_tenants_users_update_own" ON public.connected_tenants AS PERMISSIVE FOR UPDATE TO public USING (((SELECT auth.uid()) = user_uuid));

DROP POLICY IF EXISTS "connected_tenants_write" ON public.connected_tenants;
CREATE POLICY "connected_tenants_write" ON public.connected_tenants AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin() OR (user_uuid = (SELECT auth.uid())))) WITH CHECK ((is_super_admin() OR (user_uuid = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "consult_logs_staff_insert" ON public.consult_logs;
CREATE POLICY "consult_logs_staff_insert" ON public.consult_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id) AND (tenant_is_writeable(tenant_id) OR is_super_admin_safe((SELECT auth.uid())))));

DROP POLICY IF EXISTS "consult_logs_staff_select" ON public.consult_logs;
CREATE POLICY "consult_logs_staff_select" ON public.consult_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id)));

DROP POLICY IF EXISTS "consult_logs_staff_update" ON public.consult_logs;
CREATE POLICY "consult_logs_staff_update" ON public.consult_logs AS PERMISSIVE FOR UPDATE TO public USING ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id))) WITH CHECK ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id) AND (tenant_is_writeable(tenant_id) OR is_super_admin_safe((SELECT auth.uid())))));

DROP POLICY IF EXISTS "quarantine_superadmin_delete" ON public.consult_logs_unmapped_quarantine;
CREATE POLICY "quarantine_superadmin_delete" ON public.consult_logs_unmapped_quarantine AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "quarantine_superadmin_select" ON public.consult_logs_unmapped_quarantine;
CREATE POLICY "quarantine_superadmin_select" ON public.consult_logs_unmapped_quarantine AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "consult_time_entries_tenant_select" ON public.consult_time_entries;
CREATE POLICY "consult_time_entries_tenant_select" ON public.consult_time_entries AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE ((tm.user_id = (SELECT auth.uid())) AND (tm.status = 'active'::text)))));

DROP POLICY IF EXISTS "consult_time_entries_vivacity_all" ON public.consult_time_entries;
CREATE POLICY "consult_time_entries_vivacity_all" ON public.consult_time_entries AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS "consultant_assignment_audit_log_superadmin_insert" ON public.consultant_assignment_audit_log;
CREATE POLICY "consultant_assignment_audit_log_superadmin_insert" ON public.consultant_assignment_audit_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "consultant_assignment_audit_log_vivacity_select" ON public.consultant_assignment_audit_log;
CREATE POLICY "consultant_assignment_audit_log_vivacity_select" ON public.consultant_assignment_audit_log AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "consultant_capacity_audit_log_superadmin_delete" ON public.consultant_capacity_audit_log;
CREATE POLICY "consultant_capacity_audit_log_superadmin_delete" ON public.consultant_capacity_audit_log AS PERMISSIVE FOR DELETE TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "consultant_capacity_audit_log_system_insert" ON public.consultant_capacity_audit_log;
CREATE POLICY "consultant_capacity_audit_log_system_insert" ON public.consultant_capacity_audit_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "consultant_capacity_audit_log_tenant_select" ON public.consultant_capacity_audit_log;
CREATE POLICY "consultant_capacity_audit_log_tenant_select" ON public.consultant_capacity_audit_log AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "consultant_capacity_audit_log_vivacity_select" ON public.consultant_capacity_audit_log;
CREATE POLICY "consultant_capacity_audit_log_vivacity_select" ON public.consultant_capacity_audit_log AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "capacity_profiles_manage_vivacity" ON public.consultant_capacity_profiles;
CREATE POLICY "capacity_profiles_manage_vivacity" ON public.consultant_capacity_profiles AS PERMISSIVE FOR ALL TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "capacity_profiles_select_own" ON public.consultant_capacity_profiles;
CREATE POLICY "capacity_profiles_select_own" ON public.consultant_capacity_profiles AS PERMISSIVE FOR SELECT TO public USING (((((SELECT auth.uid()))::text = (user_id)::text) OR is_vivacity_team_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "cp_insert_auth" ON public.conversation_participants;
CREATE POLICY "cp_insert_auth" ON public.conversation_participants AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_super_admin() OR is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM tenant_conversations tc
  WHERE ((tc.id = conversation_participants.conversation_id) AND (tc.tenant_id IN ( SELECT tu.tenant_id
          FROM tenant_users tu
         WHERE (tu.user_id = (SELECT auth.uid())))))))));

DROP POLICY IF EXISTS "cp_select_member" ON public.conversation_participants;
CREATE POLICY "cp_select_member" ON public.conversation_participants AS PERMISSIVE FOR SELECT TO public USING ((is_super_admin() OR is_vivacity_team_safe((SELECT auth.uid())) OR (user_id = (SELECT auth.uid())) OR is_conversation_participant_safe(conversation_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS "cp_update_own" ON public.conversation_participants;
CREATE POLICY "cp_update_own" ON public.conversation_participants AS PERMISSIVE FOR UPDATE TO public USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "copilot_messages_insert_session_owner" ON public.copilot_messages;
CREATE POLICY "copilot_messages_insert_session_owner" ON public.copilot_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM copilot_sessions cs
  WHERE ((cs.id = copilot_messages.session_id) AND (cs.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "copilot_messages_select_session_owner" ON public.copilot_messages;
CREATE POLICY "copilot_messages_select_session_owner" ON public.copilot_messages AS PERMISSIVE FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM copilot_sessions cs
  WHERE ((cs.id = copilot_messages.session_id) AND (cs.user_id = (SELECT auth.uid()))))) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "copilot_sessions_insert_own" ON public.copilot_sessions;
CREATE POLICY "copilot_sessions_insert_own" ON public.copilot_sessions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((SELECT auth.uid()) = user_id) AND is_vivacity_team_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "copilot_sessions_select_own" ON public.copilot_sessions;
CREATE POLICY "copilot_sessions_select_own" ON public.copilot_sessions AS PERMISSIVE FOR SELECT TO public USING ((((SELECT auth.uid()) = user_id) AND is_vivacity_team_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "copilot_sessions_select_superadmin" ON public.copilot_sessions;
CREATE POLICY "copilot_sessions_select_superadmin" ON public.copilot_sessions AS PERMISSIVE FOR SELECT TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "copilot_sessions_update_own" ON public.copilot_sessions;
CREATE POLICY "copilot_sessions_update_own" ON public.copilot_sessions AS PERMISSIVE FOR UPDATE TO public USING ((((SELECT auth.uid()) = user_id) AND is_vivacity_team_safe((SELECT auth.uid()))));