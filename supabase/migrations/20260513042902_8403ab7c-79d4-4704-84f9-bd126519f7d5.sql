-- P1-b Batch A2 — RLS auth.uid() subquery optimization

-- ai_client_query_usage
DROP POLICY IF EXISTS users_select_own_usage ON public.ai_client_query_usage;
CREATE POLICY users_select_own_usage ON public.ai_client_query_usage AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS vivacity_internal_all_usage ON public.ai_client_query_usage;
CREATE POLICY vivacity_internal_all_usage ON public.ai_client_query_usage AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_internal_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_internal_safe((SELECT auth.uid())));

-- ai_event_payloads
DROP POLICY IF EXISTS vivacity_staff_insert_ai_event_payloads ON public.ai_event_payloads;
CREATE POLICY vivacity_staff_insert_ai_event_payloads ON public.ai_event_payloads AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));
DROP POLICY IF EXISTS vivacity_staff_select_ai_event_payloads ON public.ai_event_payloads;
CREATE POLICY vivacity_staff_select_ai_event_payloads ON public.ai_event_payloads AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

-- ai_events
DROP POLICY IF EXISTS vivacity_staff_insert_ai_events ON public.ai_events;
CREATE POLICY vivacity_staff_insert_ai_events ON public.ai_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));
DROP POLICY IF EXISTS vivacity_staff_select_ai_events ON public.ai_events;
CREATE POLICY vivacity_staff_select_ai_events ON public.ai_events AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- ai_evidence_analysis_usage
DROP POLICY IF EXISTS aieau_insert_own ON public.ai_evidence_analysis_usage;
CREATE POLICY aieau_insert_own ON public.ai_evidence_analysis_usage AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS aieau_select_own ON public.ai_evidence_analysis_usage;
CREATE POLICY aieau_select_own ON public.ai_evidence_analysis_usage AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (SELECT auth.uid())));

-- ai_feature_overrides
DROP POLICY IF EXISTS ai_feature_overrides_superadmin_delete ON public.ai_feature_overrides;
CREATE POLICY ai_feature_overrides_superadmin_delete ON public.ai_feature_overrides AS PERMISSIVE FOR DELETE TO public USING (is_super_admin_safe((SELECT auth.uid())));
DROP POLICY IF EXISTS ai_feature_overrides_superadmin_insert ON public.ai_feature_overrides;
CREATE POLICY ai_feature_overrides_superadmin_insert ON public.ai_feature_overrides AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_super_admin_safe((SELECT auth.uid())));
DROP POLICY IF EXISTS ai_feature_overrides_superadmin_select ON public.ai_feature_overrides;
CREATE POLICY ai_feature_overrides_superadmin_select ON public.ai_feature_overrides AS PERMISSIVE FOR SELECT TO public USING (is_super_admin_safe((SELECT auth.uid())));
DROP POLICY IF EXISTS ai_feature_overrides_superadmin_update ON public.ai_feature_overrides;
CREATE POLICY ai_feature_overrides_superadmin_update ON public.ai_feature_overrides AS PERMISSIVE FOR UPDATE TO public USING (is_super_admin_safe((SELECT auth.uid())));
DROP POLICY IF EXISTS ai_feature_overrides_vivacity_select ON public.ai_feature_overrides;
CREATE POLICY ai_feature_overrides_vivacity_select ON public.ai_feature_overrides AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- ai_feedback
DROP POLICY IF EXISTS vivacity_staff_insert_ai_feedback ON public.ai_feedback;
CREATE POLICY vivacity_staff_insert_ai_feedback ON public.ai_feedback AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));
DROP POLICY IF EXISTS vivacity_staff_select_ai_feedback ON public.ai_feedback;
CREATE POLICY vivacity_staff_select_ai_feedback ON public.ai_feedback AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- ai_interaction_logs
DROP POLICY IF EXISTS ai_logs_insert_own ON public.ai_interaction_logs;
CREATE POLICY ai_logs_insert_own ON public.ai_interaction_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY IF EXISTS ai_logs_select_own ON public.ai_interaction_logs;
CREATE POLICY ai_logs_select_own ON public.ai_interaction_logs AS PERMISSIVE FOR SELECT TO authenticated USING (((SELECT auth.uid()) = user_id));
DROP POLICY IF EXISTS vivacity_internal_insert_ai_logs ON public.ai_interaction_logs;
CREATE POLICY vivacity_internal_insert_ai_logs ON public.ai_interaction_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_internal_safe((SELECT auth.uid())) AND (user_id = (SELECT auth.uid()))));
DROP POLICY IF EXISTS vivacity_internal_read_ai_logs ON public.ai_interaction_logs;
CREATE POLICY vivacity_internal_read_ai_logs ON public.ai_interaction_logs AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- ai_quality_events
DROP POLICY IF EXISTS vivacity_internal_insert_ai_quality_events ON public.ai_quality_events;
CREATE POLICY vivacity_internal_insert_ai_quality_events ON public.ai_quality_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.is_vivacity_internal = true) AND (u.archived = false)))));
DROP POLICY IF EXISTS vivacity_internal_select_ai_quality_events ON public.ai_quality_events;
CREATE POLICY vivacity_internal_select_ai_quality_events ON public.ai_quality_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.is_vivacity_internal = true) AND (u.archived = false)))));

-- ai_review_flags
DROP POLICY IF EXISTS vivacity_internal_insert_ai_flags ON public.ai_review_flags;
CREATE POLICY vivacity_internal_insert_ai_flags ON public.ai_review_flags AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.is_vivacity_internal = true) AND (u.archived = false)))));
DROP POLICY IF EXISTS vivacity_internal_select_ai_flags ON public.ai_review_flags;
CREATE POLICY vivacity_internal_select_ai_flags ON public.ai_review_flags AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.is_vivacity_internal = true) AND (u.archived = false)))));
DROP POLICY IF EXISTS vivacity_internal_update_ai_flags ON public.ai_review_flags;
CREATE POLICY vivacity_internal_update_ai_flags ON public.ai_review_flags AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.is_vivacity_internal = true) AND (u.archived = false))))) WITH CHECK ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.is_vivacity_internal = true) AND (u.archived = false)))));

-- ai_suggestions
DROP POLICY IF EXISTS ai_suggestions_manage ON public.ai_suggestions;
CREATE POLICY ai_suggestions_manage ON public.ai_suggestions AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid())))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));
DROP POLICY IF EXISTS ai_suggestions_select ON public.ai_suggestions;
CREATE POLICY ai_suggestions_select ON public.ai_suggestions AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

-- app_settings
DROP POLICY IF EXISTS app_settings_manage ON public.app_settings;
CREATE POLICY app_settings_manage ON public.app_settings AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));
DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
CREATE POLICY app_settings_select ON public.app_settings AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));

-- assistant_audit_log
DROP POLICY IF EXISTS assistant_audit_log_insert ON public.assistant_audit_log;
CREATE POLICY assistant_audit_log_insert ON public.assistant_audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((viewer_user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS assistant_audit_log_select ON public.assistant_audit_log;
CREATE POLICY assistant_audit_log_select ON public.assistant_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (viewer_user_id = (SELECT auth.uid()))));
DROP POLICY IF EXISTS assistant_audit_log_superadmin_own ON public.assistant_audit_log;
CREATE POLICY assistant_audit_log_superadmin_own ON public.assistant_audit_log AS PERMISSIVE FOR ALL TO authenticated USING (((viewer_user_id = (SELECT auth.uid())) AND is_super_admin((SELECT auth.uid())))) WITH CHECK (((viewer_user_id = (SELECT auth.uid())) AND is_super_admin((SELECT auth.uid()))));

-- assistant_messages
DROP POLICY IF EXISTS assistant_messages_insert ON public.assistant_messages;
CREATE POLICY assistant_messages_insert ON public.assistant_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM assistant_threads t WHERE ((t.id = assistant_messages.thread_id) AND (t.viewer_user_id = (SELECT auth.uid()))))));
DROP POLICY IF EXISTS assistant_messages_select ON public.assistant_messages;
CREATE POLICY assistant_messages_select ON public.assistant_messages AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM assistant_threads t WHERE ((t.id = assistant_messages.thread_id) AND (t.viewer_user_id = (SELECT auth.uid())))))));
DROP POLICY IF EXISTS assistant_messages_via_thread ON public.assistant_messages;
CREATE POLICY assistant_messages_via_thread ON public.assistant_messages AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1 FROM assistant_threads t WHERE ((t.id = assistant_messages.thread_id) AND (t.viewer_user_id = (SELECT auth.uid())) AND is_super_admin((SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1 FROM assistant_threads t WHERE ((t.id = assistant_messages.thread_id) AND (t.viewer_user_id = (SELECT auth.uid())) AND is_super_admin((SELECT auth.uid()))))));

-- assistant_threads
DROP POLICY IF EXISTS assistant_threads_manage ON public.assistant_threads;
CREATE POLICY assistant_threads_manage ON public.assistant_threads AS PERMISSIVE FOR ALL TO authenticated USING ((viewer_user_id = (SELECT auth.uid()))) WITH CHECK ((viewer_user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS assistant_threads_select ON public.assistant_threads;
CREATE POLICY assistant_threads_select ON public.assistant_threads AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR (viewer_user_id = (SELECT auth.uid()))));
DROP POLICY IF EXISTS assistant_threads_superadmin_own ON public.assistant_threads;
CREATE POLICY assistant_threads_superadmin_own ON public.assistant_threads AS PERMISSIVE FOR ALL TO authenticated USING (((viewer_user_id = (SELECT auth.uid())) AND is_super_admin((SELECT auth.uid())))) WITH CHECK (((viewer_user_id = (SELECT auth.uid())) AND is_super_admin((SELECT auth.uid()))));

-- audit
DROP POLICY IF EXISTS audit_delete ON public.audit;
CREATE POLICY audit_delete ON public.audit AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));
DROP POLICY IF EXISTS audit_insert ON public.audit;
CREATE POLICY audit_insert ON public.audit AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_tenant_access_safe(tenant_id, (SELECT auth.uid())) AND (created_by = (SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_select ON public.audit;
CREATE POLICY audit_select ON public.audit AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_update ON public.audit;
CREATE POLICY audit_update ON public.audit AS PERMISSIVE FOR UPDATE TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid()))) WITH CHECK (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

-- audit_action
DROP POLICY IF EXISTS audit_action_insert ON public.audit_action;
CREATE POLICY audit_action_insert ON public.audit_action AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = (SELECT auth.uid())) AND (EXISTS ( SELECT 1 FROM audit a WHERE ((a.id = audit_action.audit_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid())))))));
DROP POLICY IF EXISTS audit_action_select ON public.audit_action;
CREATE POLICY audit_action_select ON public.audit_action AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (assigned_to = (SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM audit a WHERE ((a.id = audit_action.audit_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid())))))));
DROP POLICY IF EXISTS audit_action_update ON public.audit_action;
CREATE POLICY audit_action_update ON public.audit_action AS PERMISSIVE FOR UPDATE TO authenticated USING (((assigned_to = (SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM audit a WHERE ((a.id = audit_action.audit_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid())))))));

-- audit_appointments
DROP POLICY IF EXISTS audit_appts_client_read ON public.audit_appointments;
CREATE POLICY audit_appts_client_read ON public.audit_appointments AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM (client_audits ca JOIN tenant_members tm ON ((tm.tenant_id = ca.subject_tenant_id))) WHERE ((ca.id = audit_appointments.audit_id) AND (tm.user_id = (SELECT auth.uid()))))));
DROP POLICY IF EXISTS audit_appts_staff_all ON public.audit_appointments;
CREATE POLICY audit_appts_staff_all ON public.audit_appointments AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((u.is_vivacity_internal = true) OR (u.global_role = ANY (ARRAY['superadmin'::text, 'admin'::text])))))));

-- audit_ask_viv_access_denied
DROP POLICY IF EXISTS ask_viv_denied_logs_read_staff ON public.audit_ask_viv_access_denied;
CREATE POLICY ask_viv_denied_logs_read_staff ON public.audit_ask_viv_access_denied AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- audit_avatars
DROP POLICY IF EXISTS audit_avatars_manage ON public.audit_avatars;
CREATE POLICY audit_avatars_manage ON public.audit_avatars AS PERMISSIVE FOR ALL TO authenticated USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS audit_avatars_select ON public.audit_avatars;
CREATE POLICY audit_avatars_select ON public.audit_avatars AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (user_id = (SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_avatars_users_insert_own ON public.audit_avatars;
CREATE POLICY audit_avatars_users_insert_own ON public.audit_avatars AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((SELECT auth.uid()) = user_id) OR is_super_admin()));

-- audit_client_impersonation
DROP POLICY IF EXISTS audit_client_impersonation_insert ON public.audit_client_impersonation;
CREATE POLICY audit_client_impersonation_insert ON public.audit_client_impersonation AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((actor_user_id = (SELECT auth.uid())) AND is_vivacity_team_safe((SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_client_impersonation_select ON public.audit_client_impersonation;
CREATE POLICY audit_client_impersonation_select ON public.audit_client_impersonation AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_client_impersonation_staff_update_own ON public.audit_client_impersonation;
CREATE POLICY audit_client_impersonation_staff_update_own ON public.audit_client_impersonation AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_staff() AND (actor_user_id = (SELECT auth.uid()))));

-- audit_dashboard_events
DROP POLICY IF EXISTS audit_dashboard_events_vivacity_insert ON public.audit_dashboard_events;
CREATE POLICY audit_dashboard_events_vivacity_insert ON public.audit_dashboard_events AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));
DROP POLICY IF EXISTS audit_dashboard_events_vivacity_select ON public.audit_dashboard_events;
CREATE POLICY audit_dashboard_events_vivacity_select ON public.audit_dashboard_events AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

-- audit_eos_events
DROP POLICY IF EXISTS audit_eos_events_insert ON public.audit_eos_events;
CREATE POLICY audit_eos_events_insert ON public.audit_eos_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = (SELECT auth.uid())) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_eos_events_select ON public.audit_eos_events;
CREATE POLICY audit_eos_events_select ON public.audit_eos_events AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

-- audit_events
DROP POLICY IF EXISTS audit_events_insert ON public.audit_events;
CREATE POLICY audit_events_insert ON public.audit_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS audit_events_select ON public.audit_events;
CREATE POLICY audit_events_select ON public.audit_events AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));

-- audit_finding
DROP POLICY IF EXISTS audit_finding_insert ON public.audit_finding;
CREATE POLICY audit_finding_insert ON public.audit_finding AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = (SELECT auth.uid())) AND (EXISTS ( SELECT 1 FROM audit a WHERE ((a.id = audit_finding.audit_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid())))))));
DROP POLICY IF EXISTS audit_finding_select ON public.audit_finding;
CREATE POLICY audit_finding_select ON public.audit_finding AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM audit a WHERE ((a.id = audit_finding.audit_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid())))))));
DROP POLICY IF EXISTS audit_finding_update ON public.audit_finding;
CREATE POLICY audit_finding_update ON public.audit_finding AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM audit a WHERE ((a.id = audit_finding.audit_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid()))))));

-- audit_gwc_trends
DROP POLICY IF EXISTS audit_gwc_trends_insert ON public.audit_gwc_trends;
CREATE POLICY audit_gwc_trends_insert ON public.audit_gwc_trends AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = (SELECT auth.uid())) AND has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_gwc_trends_select ON public.audit_gwc_trends;
CREATE POLICY audit_gwc_trends_select ON public.audit_gwc_trends AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_gwc_trends_tenant_insert_own ON public.audit_gwc_trends;
CREATE POLICY audit_gwc_trends_tenant_insert_own ON public.audit_gwc_trends AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id IN ( SELECT tenant_users.tenant_id FROM tenant_users WHERE (tenant_users.user_id = (SELECT auth.uid())))));
DROP POLICY IF EXISTS audit_gwc_trends_tenant_select_own ON public.audit_gwc_trends;
CREATE POLICY audit_gwc_trends_tenant_select_own ON public.audit_gwc_trends AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT tenant_users.tenant_id FROM tenant_users WHERE (tenant_users.user_id = (SELECT auth.uid())))));

-- audit_inspection
DROP POLICY IF EXISTS audit_inspection_manage ON public.audit_inspection;
CREATE POLICY audit_inspection_manage ON public.audit_inspection AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid())))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_inspection_select ON public.audit_inspection;
CREATE POLICY audit_inspection_select ON public.audit_inspection AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

-- audit_intelligence_packs
DROP POLICY IF EXISTS tenant_users_read_approved ON public.audit_intelligence_packs;
CREATE POLICY tenant_users_read_approved ON public.audit_intelligence_packs AS PERMISSIVE FOR SELECT TO authenticated USING (((status = 'approved'::text) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));
DROP POLICY IF EXISTS vivacity_team_full_access ON public.audit_intelligence_packs;
CREATE POLICY vivacity_team_full_access ON public.audit_intelligence_packs AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

-- audit_invites
DROP POLICY IF EXISTS audit_invites_manage ON public.audit_invites;
CREATE POLICY audit_invites_manage ON public.audit_invites AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));
DROP POLICY IF EXISTS audit_invites_select ON public.audit_invites;
CREATE POLICY audit_invites_select ON public.audit_invites AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_invites_staff_select ON public.audit_invites;
CREATE POLICY audit_invites_staff_select ON public.audit_invites AS PERMISSIVE FOR SELECT TO authenticated USING ((is_superadmin() OR is_vivacity_team_user((SELECT auth.uid()))));

-- audit_log
DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
CREATE POLICY audit_log_insert ON public.audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((editor_uuid = (SELECT auth.uid())));
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (user_uuid = (SELECT auth.uid())) OR (editor_uuid = (SELECT auth.uid()))));

-- audit_people_analyzer
DROP POLICY IF EXISTS audit_people_analyzer_insert ON public.audit_people_analyzer;
CREATE POLICY audit_people_analyzer_insert ON public.audit_people_analyzer AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = (SELECT auth.uid())) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_people_analyzer_select ON public.audit_people_analyzer;
CREATE POLICY audit_people_analyzer_select ON public.audit_people_analyzer AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

-- audit_question
DROP POLICY IF EXISTS audit_question_manage ON public.audit_question;
CREATE POLICY audit_question_manage ON public.audit_question AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1 FROM (audit_section s JOIN audit a ON ((a.id = s.audit_id))) WHERE ((s.id = audit_question.audit_section_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1 FROM (audit_section s JOIN audit a ON ((a.id = s.audit_id))) WHERE ((s.id = audit_question.audit_section_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid()))))));
DROP POLICY IF EXISTS audit_question_select ON public.audit_question;
CREATE POLICY audit_question_select ON public.audit_question AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM (audit_section s JOIN audit a ON ((a.id = s.audit_id))) WHERE ((s.id = audit_question.audit_section_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid())))))));

-- audit_question_bank
DROP POLICY IF EXISTS audit_question_bank_manage ON public.audit_question_bank;
CREATE POLICY audit_question_bank_manage ON public.audit_question_bank AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));
DROP POLICY IF EXISTS audit_question_bank_select ON public.audit_question_bank;
CREATE POLICY audit_question_bank_select ON public.audit_question_bank AS PERMISSIVE FOR SELECT TO authenticated USING (((active = true) OR is_super_admin_safe((SELECT auth.uid()))));

-- audit_response
DROP POLICY IF EXISTS audit_response_insert ON public.audit_response;
CREATE POLICY audit_response_insert ON public.audit_response AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = (SELECT auth.uid())) AND (EXISTS ( SELECT 1 FROM ((audit_question q JOIN audit_section s ON ((s.id = q.audit_section_id))) JOIN audit a ON ((a.id = s.audit_id))) WHERE ((q.id = audit_response.audit_question_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid())))))));
DROP POLICY IF EXISTS audit_response_select ON public.audit_response;
CREATE POLICY audit_response_select ON public.audit_response AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM ((audit_question q JOIN audit_section s ON ((s.id = q.audit_section_id))) JOIN audit a ON ((a.id = s.audit_id))) WHERE ((q.id = audit_response.audit_question_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid())))))));
DROP POLICY IF EXISTS audit_response_update ON public.audit_response;
CREATE POLICY audit_response_update ON public.audit_response AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM ((audit_question q JOIN audit_section s ON ((s.id = q.audit_section_id))) JOIN audit a ON ((a.id = s.audit_id))) WHERE ((q.id = audit_response.audit_question_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid()))))));

-- audit_restricted_actions
DROP POLICY IF EXISTS audit_restricted_actions_insert ON public.audit_restricted_actions;
CREATE POLICY audit_restricted_actions_insert ON public.audit_restricted_actions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS audit_restricted_actions_select ON public.audit_restricted_actions;
CREATE POLICY audit_restricted_actions_select ON public.audit_restricted_actions AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_restricted_actions_users_insert_own ON public.audit_restricted_actions;
CREATE POLICY audit_restricted_actions_users_insert_own ON public.audit_restricted_actions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((SELECT auth.uid()) = user_id));

-- audit_seat_health
DROP POLICY IF EXISTS audit_seat_health_insert ON public.audit_seat_health;
CREATE POLICY audit_seat_health_insert ON public.audit_seat_health AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = (SELECT auth.uid())) AND has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_seat_health_select ON public.audit_seat_health;
CREATE POLICY audit_seat_health_select ON public.audit_seat_health AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid()))));

-- audit_section
DROP POLICY IF EXISTS audit_section_manage ON public.audit_section;
CREATE POLICY audit_section_manage ON public.audit_section AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1 FROM audit a WHERE ((a.id = audit_section.audit_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1 FROM audit a WHERE ((a.id = audit_section.audit_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid()))))));
DROP POLICY IF EXISTS audit_section_select ON public.audit_section;
CREATE POLICY audit_section_select ON public.audit_section AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM audit a WHERE ((a.id = audit_section.audit_id) AND has_tenant_access_safe(a.tenant_id, (SELECT auth.uid())))))));

-- audit_succession_events
DROP POLICY IF EXISTS audit_succession_events_insert ON public.audit_succession_events;
CREATE POLICY audit_succession_events_insert ON public.audit_succession_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = (SELECT auth.uid())) AND has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_succession_events_select ON public.audit_succession_events;
CREATE POLICY audit_succession_events_select ON public.audit_succession_events AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid()))));

-- audit_template_questions
DROP POLICY IF EXISTS audit_template_questions_manage ON public.audit_template_questions;
CREATE POLICY audit_template_questions_manage ON public.audit_template_questions AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_template_questions_select ON public.audit_template_questions;
CREATE POLICY audit_template_questions_select ON public.audit_template_questions AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM audit_templates t WHERE ((t.id = audit_template_questions.template_id) AND (((t.access = 'public'::text) AND (t.status = 'published'::text)) OR has_tenant_access_safe(t.tenant_id, (SELECT auth.uid()))))))));

-- audit_template_response_sets
DROP POLICY IF EXISTS audit_template_response_sets_delete ON public.audit_template_response_sets;
CREATE POLICY audit_template_response_sets_delete ON public.audit_template_response_sets AS PERMISSIVE FOR DELETE TO public USING ((is_super_admin() OR (user_in_tenant(tenant_id) AND (created_by = (SELECT auth.uid())))));
DROP POLICY IF EXISTS audit_template_response_sets_manage ON public.audit_template_response_sets;
CREATE POLICY audit_template_response_sets_manage ON public.audit_template_response_sets AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_template_response_sets_select ON public.audit_template_response_sets;
CREATE POLICY audit_template_response_sets_select ON public.audit_template_response_sets AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (is_global = true) OR ((tenant_id IS NOT NULL) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid())))));

-- audit_templates
DROP POLICY IF EXISTS audit_templates_manage ON public.audit_templates;
CREATE POLICY audit_templates_manage ON public.audit_templates AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_templates_select ON public.audit_templates;
CREATE POLICY audit_templates_select ON public.audit_templates AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR ((access = 'public'::text) AND (status = 'published'::text)) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

-- audit_upgrade_attempts
DROP POLICY IF EXISTS audit_upgrade_attempts_insert ON public.audit_upgrade_attempts;
CREATE POLICY audit_upgrade_attempts_insert ON public.audit_upgrade_attempts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((actor_user_id = (SELECT auth.uid())) AND has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_upgrade_attempts_select ON public.audit_upgrade_attempts;
CREATE POLICY audit_upgrade_attempts_select ON public.audit_upgrade_attempts AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_upgrade_attempts_users_insert ON public.audit_upgrade_attempts;
CREATE POLICY audit_upgrade_attempts_users_insert ON public.audit_upgrade_attempts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((SELECT auth.uid()) = actor_user_id));

-- audit_user_events
DROP POLICY IF EXISTS audit_user_events_select_own ON public.audit_user_events;
CREATE POLICY audit_user_events_select_own ON public.audit_user_events AS PERMISSIVE FOR SELECT TO authenticated USING (((actor_user_uuid = (SELECT auth.uid())) OR (target_user_uuid = (SELECT auth.uid()))));
DROP POLICY IF EXISTS audit_user_events_select_superadmin ON public.audit_user_events;
CREATE POLICY audit_user_events_select_superadmin ON public.audit_user_events AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));
DROP POLICY IF EXISTS audit_user_events_select_tenant_admin ON public.audit_user_events;
CREATE POLICY audit_user_events_select_tenant_admin ON public.audit_user_events AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM tenant_users tu WHERE ((tu.user_id = (SELECT auth.uid())) AND (tu.tenant_id = audit_user_events.tenant_id) AND (tu.access_scope = 'full'::text) AND (tu.relationship_role = ANY (ARRAY['primary_contact'::tenant_user_role, 'secondary_contact'::tenant_user_role])))))));

-- auth_tokens
DROP POLICY IF EXISTS auth_tokens_admin_delete ON public.auth_tokens;
CREATE POLICY auth_tokens_admin_delete ON public.auth_tokens AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));
DROP POLICY IF EXISTS auth_tokens_admin_insert ON public.auth_tokens;
CREATE POLICY auth_tokens_admin_insert ON public.auth_tokens AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_super_admin_safe((SELECT auth.uid())));
DROP POLICY IF EXISTS auth_tokens_admin_update ON public.auth_tokens;
CREATE POLICY auth_tokens_admin_update ON public.auth_tokens AS PERMISSIVE FOR UPDATE TO authenticated WITH CHECK (is_super_admin_safe((SELECT auth.uid())));