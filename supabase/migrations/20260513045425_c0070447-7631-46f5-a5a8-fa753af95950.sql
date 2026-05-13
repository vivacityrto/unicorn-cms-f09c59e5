-- P1-b Batch C1b: auth.uid() → (SELECT auth.uid()) hardening
DROP POLICY IF EXISTS "ce_delete_staff" ON public.chat_escalations;
CREATE POLICY "ce_delete_staff" ON public.chat_escalations AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "ce_insert_own" ON public.chat_escalations;
CREATE POLICY "ce_insert_own" ON public.chat_escalations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM chat_sessions s
  WHERE ((s.id = chat_escalations.session_id) AND (s.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "ce_insert_staff" ON public.chat_escalations;
CREATE POLICY "ce_insert_staff" ON public.chat_escalations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "ce_select_own" ON public.chat_escalations;
CREATE POLICY "ce_select_own" ON public.chat_escalations AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM chat_sessions s
  WHERE ((s.id = chat_escalations.session_id) AND (s.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "ce_select_staff" ON public.chat_escalations;
CREATE POLICY "ce_select_staff" ON public.chat_escalations AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cm_delete_staff" ON public.chat_messages;
CREATE POLICY "cm_delete_staff" ON public.chat_messages AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cm_insert_own" ON public.chat_messages;
CREATE POLICY "cm_insert_own" ON public.chat_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM chat_sessions s
  WHERE ((s.id = chat_messages.session_id) AND (s.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "cm_select_own" ON public.chat_messages;
CREATE POLICY "cm_select_own" ON public.chat_messages AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM chat_sessions s
  WHERE ((s.id = chat_messages.session_id) AND (s.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "cm_select_staff" ON public.chat_messages;
CREATE POLICY "cm_select_staff" ON public.chat_messages AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cs_delete_staff" ON public.chat_sessions;
CREATE POLICY "cs_delete_staff" ON public.chat_sessions AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cs_insert_own" ON public.chat_sessions;
CREATE POLICY "cs_insert_own" ON public.chat_sessions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_uuid = (SELECT auth.uid())));

DROP POLICY IF EXISTS "cs_select_own" ON public.chat_sessions;
CREATE POLICY "cs_select_own" ON public.chat_sessions AS PERMISSIVE FOR SELECT TO authenticated USING ((user_uuid = (SELECT auth.uid())));

DROP POLICY IF EXISTS "cs_select_staff" ON public.chat_sessions;
CREATE POLICY "cs_select_staff" ON public.chat_sessions AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "clickup_task_comments_staff_select" ON public.clickup_task_comments;
CREATE POLICY "clickup_task_comments_staff_select" ON public.clickup_task_comments AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "clickup_tasks_api_staff_delete" ON public.clickup_tasks_api;
CREATE POLICY "clickup_tasks_api_staff_delete" ON public.clickup_tasks_api AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "clickup_tasks_api_staff_insert" ON public.clickup_tasks_api;
CREATE POLICY "clickup_tasks_api_staff_insert" ON public.clickup_tasks_api AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "clickup_tasks_api_staff_select" ON public.clickup_tasks_api;
CREATE POLICY "clickup_tasks_api_staff_select" ON public.clickup_tasks_api AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "clickup_tasks_api_staff_update" ON public.clickup_tasks_api;
CREATE POLICY "clickup_tasks_api_staff_update" ON public.clickup_tasks_api AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "tenant_users_can_read_own_clickup_taskstimes" ON public.clickup_taskstimes;
CREATE POLICY "tenant_users_can_read_own_clickup_taskstimes" ON public.clickup_taskstimes AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "vivacity_team_can_delete_clickup_taskstimes" ON public.clickup_taskstimes;
CREATE POLICY "vivacity_team_can_delete_clickup_taskstimes" ON public.clickup_taskstimes AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "vivacity_team_can_insert_clickup_taskstimes" ON public.clickup_taskstimes;
CREATE POLICY "vivacity_team_can_insert_clickup_taskstimes" ON public.clickup_taskstimes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "vivacity_team_can_read_clickup_taskstimes" ON public.clickup_taskstimes;
CREATE POLICY "vivacity_team_can_read_clickup_taskstimes" ON public.clickup_taskstimes AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "vivacity_team_can_update_clickup_taskstimes" ON public.clickup_taskstimes;
CREATE POLICY "vivacity_team_can_update_clickup_taskstimes" ON public.clickup_taskstimes AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "clickup_tenant_mapping_delete" ON public.clickup_tenant_mapping;
CREATE POLICY "clickup_tenant_mapping_delete" ON public.clickup_tenant_mapping AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "clickup_tenant_mapping_read" ON public.clickup_tenant_mapping;
CREATE POLICY "clickup_tenant_mapping_read" ON public.clickup_tenant_mapping AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "clickup_tenant_mapping_update" ON public.clickup_tenant_mapping;
CREATE POLICY "clickup_tenant_mapping_update" ON public.clickup_tenant_mapping AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_staff((SELECT auth.uid()))) WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "clickup_tenant_mapping_write" ON public.clickup_tenant_mapping;
CREATE POLICY "clickup_tenant_mapping_write" ON public.clickup_tenant_mapping AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "clickup_time_entries_vivacity_select" ON public.clickup_time_entries;
CREATE POLICY "clickup_time_entries_vivacity_select" ON public.clickup_time_entries AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_action_item_comments_tenant_all" ON public.client_action_item_comments;
CREATE POLICY "client_action_item_comments_tenant_all" ON public.client_action_item_comments AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT tenant_users.tenant_id
   FROM tenant_users
  WHERE (tenant_users.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "client_action_items_tenant_delete" ON public.client_action_items;
CREATE POLICY "client_action_items_tenant_delete" ON public.client_action_items AS PERMISSIVE FOR DELETE TO public USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.tenant_id = client_action_items.tenant_id)))) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role])))))));

DROP POLICY IF EXISTS "client_action_items_tenant_insert" ON public.client_action_items;
CREATE POLICY "client_action_items_tenant_insert" ON public.client_action_items AS PERMISSIVE FOR INSERT TO public WITH CHECK (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.tenant_id = client_action_items.tenant_id)))) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role])))))));

DROP POLICY IF EXISTS "client_action_items_tenant_select" ON public.client_action_items;
CREATE POLICY "client_action_items_tenant_select" ON public.client_action_items AS PERMISSIVE FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.tenant_id = client_action_items.tenant_id)))) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role])))))));

DROP POLICY IF EXISTS "client_action_items_tenant_update" ON public.client_action_items;
CREATE POLICY "client_action_items_tenant_update" ON public.client_action_items AS PERMISSIVE FOR UPDATE TO public USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.tenant_id = client_action_items.tenant_id)))) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role])))))));

DROP POLICY IF EXISTS "client_own_messages_select" ON public.client_ai_messages;
CREATE POLICY "client_own_messages_select" ON public.client_ai_messages AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM client_ai_sessions s
  WHERE ((s.id = client_ai_messages.session_id) AND (s.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "vivacity_staff_select_client_ai_messages" ON public.client_ai_messages;
CREATE POLICY "vivacity_staff_select_client_ai_messages" ON public.client_ai_messages AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_own_sessions_insert" ON public.client_ai_sessions;
CREATE POLICY "client_own_sessions_insert" ON public.client_ai_sessions AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "client_own_sessions_select" ON public.client_ai_sessions;
CREATE POLICY "client_own_sessions_select" ON public.client_ai_sessions AS PERMISSIVE FOR SELECT TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "client_own_sessions_update" ON public.client_ai_sessions;
CREATE POLICY "client_own_sessions_update" ON public.client_ai_sessions AS PERMISSIVE FOR UPDATE TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "vivacity_staff_select_client_ai_sessions" ON public.client_ai_sessions;
CREATE POLICY "vivacity_staff_select_client_ai_sessions" ON public.client_ai_sessions AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_alerts_insert_rpc" ON public.client_alerts;
CREATE POLICY "client_alerts_insert_rpc" ON public.client_alerts AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id IN ( SELECT connected_tenants.tenant_id
   FROM connected_tenants
  WHERE (connected_tenants.user_uuid = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "client_alerts_select_tenant" ON public.client_alerts;
CREATE POLICY "client_alerts_select_tenant" ON public.client_alerts AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT connected_tenants.tenant_id
   FROM connected_tenants
  WHERE (connected_tenants.user_uuid = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "client_alerts_update_dismiss" ON public.client_alerts;
CREATE POLICY "client_alerts_update_dismiss" ON public.client_alerts AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id IN ( SELECT connected_tenants.tenant_id
   FROM connected_tenants
  WHERE (connected_tenants.user_uuid = (SELECT auth.uid())))) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = ANY (ARRAY['SuperAdmin'::text, 'Admin'::text])))))));

DROP POLICY IF EXISTS "client_audit_actions_staff_all" ON public.client_audit_actions;
CREATE POLICY "client_audit_actions_staff_all" ON public.client_audit_actions AS PERMISSIVE FOR ALL TO public USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_audit_documents_staff_all" ON public.client_audit_documents;
CREATE POLICY "client_audit_documents_staff_all" ON public.client_audit_documents AS PERMISSIVE FOR ALL TO public USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_audit_findings_staff_all" ON public.client_audit_findings;
CREATE POLICY "client_audit_findings_staff_all" ON public.client_audit_findings AS PERMISSIVE FOR ALL TO public USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_audit_log_superadmin_insert" ON public.client_audit_log;
CREATE POLICY "client_audit_log_superadmin_insert" ON public.client_audit_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role]))))));

DROP POLICY IF EXISTS "client_audit_log_superadmin_select" ON public.client_audit_log;
CREATE POLICY "client_audit_log_superadmin_select" ON public.client_audit_log AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role]))))));

DROP POLICY IF EXISTS "audit_refs_staff_all" ON public.client_audit_references;
CREATE POLICY "audit_refs_staff_all" ON public.client_audit_references AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((u.is_vivacity_internal = true) OR (u.global_role = ANY (ARRAY['superadmin'::text, 'admin'::text])))))));

DROP POLICY IF EXISTS "audit_refs_tenant_read" ON public.client_audit_references;
CREATE POLICY "audit_refs_tenant_read" ON public.client_audit_references AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = client_audit_references.subject_tenant_id) AND (tm.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "card_delete_vivacity_staff" ON public.client_audit_response_documents;
CREATE POLICY "card_delete_vivacity_staff" ON public.client_audit_response_documents AS PERMISSIVE FOR DELETE TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "card_insert_vivacity_staff" ON public.client_audit_response_documents;
CREATE POLICY "card_insert_vivacity_staff" ON public.client_audit_response_documents AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_vivacity_team_safe((SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM ((client_audit_responses r
     JOIN client_audits a ON ((a.id = r.audit_id)))
     JOIN documents d ON ((d.id = client_audit_response_documents.document_id)))
  WHERE ((r.id = client_audit_response_documents.response_id) AND (d.tenant_id = a.subject_tenant_id))))));

DROP POLICY IF EXISTS "card_select_vivacity_staff" ON public.client_audit_response_documents;
CREATE POLICY "card_select_vivacity_staff" ON public.client_audit_response_documents AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "card_update_vivacity_staff" ON public.client_audit_response_documents;
CREATE POLICY "card_update_vivacity_staff" ON public.client_audit_response_documents AS PERMISSIVE FOR UPDATE TO public USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK ((is_vivacity_team_safe((SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM ((client_audit_responses r
     JOIN client_audits a ON ((a.id = r.audit_id)))
     JOIN documents d ON ((d.id = client_audit_response_documents.document_id)))
  WHERE ((r.id = client_audit_response_documents.response_id) AND (d.tenant_id = a.subject_tenant_id))))));

DROP POLICY IF EXISTS "client_audit_responses_staff_all" ON public.client_audit_responses;
CREATE POLICY "client_audit_responses_staff_all" ON public.client_audit_responses AS PERMISSIVE FOR ALL TO public USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_audit_sections_staff_all" ON public.client_audit_sections;
CREATE POLICY "client_audit_sections_staff_all" ON public.client_audit_sections AS PERMISSIVE FOR ALL TO public USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_audits_staff_all" ON public.client_audits;
CREATE POLICY "client_audits_staff_all" ON public.client_audits AS PERMISSIVE FOR ALL TO public USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_commitments_delete_superadmin" ON public.client_commitments;
CREATE POLICY "client_commitments_delete_superadmin" ON public.client_commitments AS PERMISSIVE FOR DELETE TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_commitments_insert_vivacity" ON public.client_commitments;
CREATE POLICY "client_commitments_insert_vivacity" ON public.client_commitments AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_commitments_select_vivacity" ON public.client_commitments;
CREATE POLICY "client_commitments_select_vivacity" ON public.client_commitments AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_commitments_update_vivacity" ON public.client_commitments;
CREATE POLICY "client_commitments_update_vivacity" ON public.client_commitments AS PERMISSIVE FOR UPDATE TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cdr_delete_staff" ON public.client_document_requests;
CREATE POLICY "cdr_delete_staff" ON public.client_document_requests AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cdr_insert_tenant" ON public.client_document_requests;
CREATE POLICY "cdr_insert_tenant" ON public.client_document_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((requested_by_user_uuid = (SELECT auth.uid())) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS "cdr_select_staff" ON public.client_document_requests;
CREATE POLICY "cdr_select_staff" ON public.client_document_requests AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cdr_select_tenant" ON public.client_document_requests;
CREATE POLICY "cdr_select_tenant" ON public.client_document_requests AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "cdr_update_requester" ON public.client_document_requests;
CREATE POLICY "cdr_update_requester" ON public.client_document_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (((requested_by_user_uuid = (SELECT auth.uid())) AND (status = 'open'::text)));

DROP POLICY IF EXISTS "cdr_update_staff" ON public.client_document_requests;
CREATE POLICY "cdr_update_staff" ON public.client_document_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cds_delete_staff" ON public.client_document_shares;
CREATE POLICY "cds_delete_staff" ON public.client_document_shares AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cds_insert_staff" ON public.client_document_shares;
CREATE POLICY "cds_insert_staff" ON public.client_document_shares AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cds_select_shared_user" ON public.client_document_shares;
CREATE POLICY "cds_select_shared_user" ON public.client_document_shares AS PERMISSIVE FOR SELECT TO authenticated USING ((shared_with_user_uuid = (SELECT auth.uid())));

DROP POLICY IF EXISTS "cds_select_staff" ON public.client_document_shares;
CREATE POLICY "cds_select_staff" ON public.client_document_shares AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cd_delete_staff" ON public.client_documents;
CREATE POLICY "cd_delete_staff" ON public.client_documents AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cd_insert_staff" ON public.client_documents;
CREATE POLICY "cd_insert_staff" ON public.client_documents AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cd_insert_tenant" ON public.client_documents;
CREATE POLICY "cd_insert_tenant" ON public.client_documents AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((direction = 'from_client'::text) AND (uploaded_by_user_uuid = (SELECT auth.uid())) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS "cd_select_staff" ON public.client_documents;
CREATE POLICY "cd_select_staff" ON public.client_documents AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cd_select_tenant" ON public.client_documents;
CREATE POLICY "cd_select_tenant" ON public.client_documents AS PERMISSIVE FOR SELECT TO authenticated USING (((visibility = 'tenant'::text) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS "cd_update_staff" ON public.client_documents;
CREATE POLICY "cd_update_staff" ON public.client_documents AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_email_queue_superadmin_all" ON public.client_email_queue;
CREATE POLICY "client_email_queue_superadmin_all" ON public.client_email_queue AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS "client_impact_reports_vivacity_update" ON public.client_impact_reports;
CREATE POLICY "client_impact_reports_vivacity_update" ON public.client_impact_reports AS PERMISSIVE FOR UPDATE TO public USING ((user_has_tenant_access(tenant_id) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Admin'::unicorn_role])))))));

DROP POLICY IF EXISTS "client_notes_delete" ON public.client_notes;
CREATE POLICY "client_notes_delete" ON public.client_notes AS PERMISSIVE FOR DELETE TO authenticated USING ((has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "client_notes_insert" ON public.client_notes;
CREATE POLICY "client_notes_insert" ON public.client_notes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "client_notes_select" ON public.client_notes;
CREATE POLICY "client_notes_select" ON public.client_notes AS PERMISSIVE FOR SELECT TO authenticated USING ((has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "client_notes_update" ON public.client_notes;
CREATE POLICY "client_notes_update" ON public.client_notes AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid())))) WITH CHECK ((has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "client_package_stage_state_tenant_select" ON public.client_package_stage_state;
CREATE POLICY "client_package_stage_state_tenant_select" ON public.client_package_stage_state AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "client_package_stage_state_tenant_update" ON public.client_package_stage_state;
CREATE POLICY "client_package_stage_state_tenant_update" ON public.client_package_stage_state AS PERMISSIVE FOR UPDATE TO authenticated USING ((tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "client_package_stages_superadmin_all" ON public.client_package_stages;
CREATE POLICY "client_package_stages_superadmin_all" ON public.client_package_stages AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS "client_package_stages_tenant_select_own" ON public.client_package_stages;
CREATE POLICY "client_package_stages_tenant_select_own" ON public.client_package_stages AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (client_packages cp
     JOIN tenant_members tm ON ((tm.tenant_id = cp.tenant_id)))
  WHERE ((cp.id = client_package_stages.client_package_id) AND (tm.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "client_packages_superadmin_all" ON public.client_packages;
CREATE POLICY "client_packages_superadmin_all" ON public.client_packages AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS "client_packages_tenant_select_own" ON public.client_packages;
CREATE POLICY "client_packages_tenant_select_own" ON public.client_packages AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.user_id = (SELECT auth.uid())) AND (tm.tenant_id = client_packages.tenant_id)))));

DROP POLICY IF EXISTS "cps_delete_staff" ON public.client_portal_sessions;
CREATE POLICY "cps_delete_staff" ON public.client_portal_sessions AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cps_insert_staff" ON public.client_portal_sessions;
CREATE POLICY "cps_insert_staff" ON public.client_portal_sessions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cps_select_staff" ON public.client_portal_sessions;
CREATE POLICY "cps_select_staff" ON public.client_portal_sessions AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "cps_select_tenant" ON public.client_portal_sessions;
CREATE POLICY "cps_select_tenant" ON public.client_portal_sessions AS PERMISSIVE FOR SELECT TO authenticated USING ((has_tenant_access_safe(tenant_id, (SELECT auth.uid())) AND ((acting_user_uuid = (SELECT auth.uid())) OR (viewer_user_uuid = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "client_stage_documents_superadmin_all" ON public.client_stage_documents;
CREATE POLICY "client_stage_documents_superadmin_all" ON public.client_stage_documents AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS "client_stage_documents_tenant_select_own" ON public.client_stage_documents;
CREATE POLICY "client_stage_documents_tenant_select_own" ON public.client_stage_documents AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM ((client_package_stages cps
     JOIN client_packages cp ON ((cp.id = cps.client_package_id)))
     JOIN tenant_members tm ON ((tm.tenant_id = cp.tenant_id)))
  WHERE ((cps.id = client_stage_documents.client_package_stage_id) AND (tm.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "cti_lifecycle_insert" ON public.client_task_instances;
CREATE POLICY "cti_lifecycle_insert" ON public.client_task_instances AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_is_writeable(stage_instance_tenant_id(stageinstance_id)) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "cti_update_via_canonical_helper" ON public.client_task_instances;
CREATE POLICY "cti_update_via_canonical_helper" ON public.client_task_instances AS PERMISSIVE FOR UPDATE TO authenticated USING ((stageinstance_id IN ( SELECT si.id
   FROM (stage_instances si
     JOIN package_instances pi ON ((pi.id = si.packageinstance_id)))
  WHERE app.user_can_access_tenant(pi.tenant_id)))) WITH CHECK ((tenant_is_writeable(stage_instance_tenant_id(stageinstance_id)) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "client_team_tasks_superadmin_all" ON public.client_team_tasks;
CREATE POLICY "client_team_tasks_superadmin_all" ON public.client_team_tasks AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS "client_team_tasks_tenant_select_own" ON public.client_team_tasks;
CREATE POLICY "client_team_tasks_tenant_select_own" ON public.client_team_tasks AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM ((client_package_stages cps
     JOIN client_packages cp ON ((cp.id = cps.client_package_id)))
     JOIN tenant_members tm ON ((tm.tenant_id = cp.tenant_id)))
  WHERE ((cps.id = client_team_tasks.client_package_stage_id) AND (tm.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "client_tga_reviews_insert_tenant" ON public.client_tga_reviews;
CREATE POLICY "client_tga_reviews_insert_tenant" ON public.client_tga_reviews AS PERMISSIVE FOR INSERT TO public WITH CHECK ((has_tenant_access_safe(tenant_id, (SELECT auth.uid())) AND (reviewed_by_user_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "client_tga_reviews_select_tenant" ON public.client_tga_reviews;
CREATE POLICY "client_tga_reviews_select_tenant" ON public.client_tga_reviews AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "client_tga_snapshot_select_scoped" ON public.client_tga_snapshot;
CREATE POLICY "client_tga_snapshot_select_scoped" ON public.client_tga_snapshot AS PERMISSIVE FOR SELECT TO authenticated USING ((is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM tga_links tl
  WHERE ((tl.client_id = client_tga_snapshot.client_id) AND has_tenant_access_safe(tl.tenant_id, (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "client_timeline_events_client_insert_visible" ON public.client_timeline_events;
CREATE POLICY "client_timeline_events_client_insert_visible" ON public.client_timeline_events AS PERMISSIVE FOR INSERT TO public WITH CHECK (((visibility = 'client'::text) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.tenant_id = client_timeline_events.tenant_id))))));

DROP POLICY IF EXISTS "client_timeline_events_client_select_visible" ON public.client_timeline_events;
CREATE POLICY "client_timeline_events_client_select_visible" ON public.client_timeline_events AS PERMISSIVE FOR SELECT TO public USING (((visibility = 'client'::text) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.tenant_id = client_timeline_events.tenant_id))))));

DROP POLICY IF EXISTS "client_timeline_events_vivacity_insert" ON public.client_timeline_events;
CREATE POLICY "client_timeline_events_vivacity_insert" ON public.client_timeline_events AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS "client_timeline_events_vivacity_select" ON public.client_timeline_events;
CREATE POLICY "client_timeline_events_vivacity_select" ON public.client_timeline_events AS PERMISSIVE FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((u.tenant_id = client_timeline_events.tenant_id) OR (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role]))))))));

DROP POLICY IF EXISTS "clients_legacy_manage" ON public.clients_legacy;
CREATE POLICY "clients_legacy_manage" ON public.clients_legacy AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "clients_legacy_select" ON public.clients_legacy;
CREATE POLICY "clients_legacy_select" ON public.clients_legacy AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));