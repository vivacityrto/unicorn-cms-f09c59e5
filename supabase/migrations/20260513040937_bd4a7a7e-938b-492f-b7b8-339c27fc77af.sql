-- P1-b Batch 12 (FINAL): user_, users, vector_, workflow_*, workload_snapshots

-- user_activity (6 policies)
DROP POLICY IF EXISTS user_activity_insert ON public.user_activity;
CREATE POLICY user_activity_insert ON public.user_activity AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS user_activity_insert_own ON public.user_activity;
CREATE POLICY user_activity_insert_own ON public.user_activity AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS user_activity_select ON public.user_activity;
CREATE POLICY user_activity_select ON public.user_activity AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin() OR (user_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS user_activity_select_own ON public.user_activity;
CREATE POLICY user_activity_select_own ON public.user_activity AS PERMISSIVE FOR SELECT TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS user_activity_select_staff ON public.user_activity;
CREATE POLICY user_activity_select_staff ON public.user_activity AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS user_activity_select_tenant_admin ON public.user_activity;
CREATE POLICY user_activity_select_tenant_admin ON public.user_activity AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

-- user_invitations (3 policies)
DROP POLICY IF EXISTS user_invitations_manage_superadmin ON public.user_invitations;
CREATE POLICY user_invitations_manage_superadmin ON public.user_invitations AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS user_invitations_manage_tenant_admin ON public.user_invitations;
CREATE POLICY user_invitations_manage_tenant_admin ON public.user_invitations AS PERMISSIVE FOR ALL TO authenticated USING (has_tenant_admin_safe(tenant_id, (SELECT auth.uid()))) WITH CHECK (has_tenant_admin_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS user_invitations_select_staff ON public.user_invitations;
CREATE POLICY user_invitations_select_staff ON public.user_invitations AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- user_microsoft_identities (7 policies)
DROP POLICY IF EXISTS identities_delete ON public.user_microsoft_identities;
CREATE POLICY identities_delete ON public.user_microsoft_identities AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS identities_insert ON public.user_microsoft_identities;
CREATE POLICY identities_insert ON public.user_microsoft_identities AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_uuid = (SELECT auth.uid())));

DROP POLICY IF EXISTS identities_select ON public.user_microsoft_identities;
CREATE POLICY identities_select ON public.user_microsoft_identities AS PERMISSIVE FOR SELECT TO authenticated USING (((user_uuid = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS identities_update ON public.user_microsoft_identities;
CREATE POLICY identities_update ON public.user_microsoft_identities AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_uuid = (SELECT auth.uid()))) WITH CHECK ((user_uuid = (SELECT auth.uid())));

DROP POLICY IF EXISTS user_ms_identity_own_insert ON public.user_microsoft_identities;
CREATE POLICY user_ms_identity_own_insert ON public.user_microsoft_identities AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((SELECT auth.uid()) = user_uuid));

DROP POLICY IF EXISTS user_ms_identity_own_select ON public.user_microsoft_identities;
CREATE POLICY user_ms_identity_own_select ON public.user_microsoft_identities AS PERMISSIVE FOR SELECT TO authenticated USING (((SELECT auth.uid()) = user_uuid));

DROP POLICY IF EXISTS user_ms_identity_own_update ON public.user_microsoft_identities;
CREATE POLICY user_ms_identity_own_update ON public.user_microsoft_identities AS PERMISSIVE FOR UPDATE TO authenticated USING (((SELECT auth.uid()) = user_uuid)) WITH CHECK (((SELECT auth.uid()) = user_uuid));

-- user_notification_integrations (3 policies)
DROP POLICY IF EXISTS user_notification_integrations_superadmin_select ON public.user_notification_integrations;
CREATE POLICY user_notification_integrations_superadmin_select ON public.user_notification_integrations AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS user_notification_integrations_users_all_own ON public.user_notification_integrations;
CREATE POLICY user_notification_integrations_users_all_own ON public.user_notification_integrations AS PERMISSIVE FOR ALL TO public USING ((user_uuid = (SELECT auth.uid())));

DROP POLICY IF EXISTS user_notification_integrations_users_select_own ON public.user_notification_integrations;
CREATE POLICY user_notification_integrations_users_select_own ON public.user_notification_integrations AS PERMISSIVE FOR SELECT TO public USING ((user_uuid = (SELECT auth.uid())));

-- user_notification_prefs (3 policies)
DROP POLICY IF EXISTS user_notification_prefs_users_insert_own ON public.user_notification_prefs;
CREATE POLICY user_notification_prefs_users_insert_own ON public.user_notification_prefs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS user_notification_prefs_users_select_own ON public.user_notification_prefs;
CREATE POLICY user_notification_prefs_users_select_own ON public.user_notification_prefs AS PERMISSIVE FOR SELECT TO public USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS user_notification_prefs_users_update_own ON public.user_notification_prefs;
CREATE POLICY user_notification_prefs_users_update_own ON public.user_notification_prefs AS PERMISSIVE FOR UPDATE TO public USING ((user_id = (SELECT auth.uid())));

-- user_notifications (4 policies)
DROP POLICY IF EXISTS user_notifications_authenticated_insert ON public.user_notifications;
CREATE POLICY user_notifications_authenticated_insert ON public.user_notifications AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS user_notifications_users_delete_own ON public.user_notifications;
CREATE POLICY user_notifications_users_delete_own ON public.user_notifications AS PERMISSIVE FOR DELETE TO public USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS user_notifications_users_select_own ON public.user_notifications;
CREATE POLICY user_notifications_users_select_own ON public.user_notifications AS PERMISSIVE FOR SELECT TO public USING (((user_id = (SELECT auth.uid())) OR is_super_admin()));

DROP POLICY IF EXISTS user_notifications_users_update_own ON public.user_notifications;
CREATE POLICY user_notifications_users_update_own ON public.user_notifications AS PERMISSIVE FOR UPDATE TO public USING ((user_id = (SELECT auth.uid())));

-- user_profile_setup_prompts (3 policies)
DROP POLICY IF EXISTS user_profile_setup_prompts_users_insert_own ON public.user_profile_setup_prompts;
CREATE POLICY user_profile_setup_prompts_users_insert_own ON public.user_profile_setup_prompts AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_uuid));

DROP POLICY IF EXISTS user_profile_setup_prompts_users_select_own ON public.user_profile_setup_prompts;
CREATE POLICY user_profile_setup_prompts_users_select_own ON public.user_profile_setup_prompts AS PERMISSIVE FOR SELECT TO public USING (((SELECT auth.uid()) = user_uuid));

DROP POLICY IF EXISTS user_profile_setup_prompts_users_update_own ON public.user_profile_setup_prompts;
CREATE POLICY user_profile_setup_prompts_users_update_own ON public.user_profile_setup_prompts AS PERMISSIVE FOR UPDATE TO public USING (((SELECT auth.uid()) = user_uuid));

-- user_time_capture_settings (5 policies)
DROP POLICY IF EXISTS user_time_capture_settings_superadmin_select ON public.user_time_capture_settings;
CREATE POLICY user_time_capture_settings_superadmin_select ON public.user_time_capture_settings AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS user_time_capture_settings_tenant_admin_select ON public.user_time_capture_settings;
CREATE POLICY user_time_capture_settings_tenant_admin_select ON public.user_time_capture_settings AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (tenant_users tu
     JOIN users u ON ((u.user_uuid = tu.user_id)))
  WHERE ((tu.user_id = (SELECT auth.uid())) AND (tu.tenant_id = user_time_capture_settings.tenant_id) AND (u.role = 'admin'::text)))));

DROP POLICY IF EXISTS user_time_capture_settings_users_insert_own ON public.user_time_capture_settings;
CREATE POLICY user_time_capture_settings_users_insert_own ON public.user_time_capture_settings AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS user_time_capture_settings_users_select_own ON public.user_time_capture_settings;
CREATE POLICY user_time_capture_settings_users_select_own ON public.user_time_capture_settings AS PERMISSIVE FOR SELECT TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS user_time_capture_settings_users_update_own ON public.user_time_capture_settings;
CREATE POLICY user_time_capture_settings_users_update_own ON public.user_time_capture_settings AS PERMISSIVE FOR UPDATE TO public USING (((SELECT auth.uid()) = user_id));

-- user_time_inbox_dismissals (3 policies)
DROP POLICY IF EXISTS user_time_inbox_dismissals_users_delete_own ON public.user_time_inbox_dismissals;
CREATE POLICY user_time_inbox_dismissals_users_delete_own ON public.user_time_inbox_dismissals AS PERMISSIVE FOR DELETE TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS user_time_inbox_dismissals_users_insert_own ON public.user_time_inbox_dismissals;
CREATE POLICY user_time_inbox_dismissals_users_insert_own ON public.user_time_inbox_dismissals AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS user_time_inbox_dismissals_users_select_own ON public.user_time_inbox_dismissals;
CREATE POLICY user_time_inbox_dismissals_users_select_own ON public.user_time_inbox_dismissals AS PERMISSIVE FOR SELECT TO public USING (((SELECT auth.uid()) = user_id));

-- user_ui_prefs (3 policies)
DROP POLICY IF EXISTS user_ui_prefs_users_insert_own ON public.user_ui_prefs;
CREATE POLICY user_ui_prefs_users_insert_own ON public.user_ui_prefs AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_uuid));

DROP POLICY IF EXISTS user_ui_prefs_users_select_own ON public.user_ui_prefs;
CREATE POLICY user_ui_prefs_users_select_own ON public.user_ui_prefs AS PERMISSIVE FOR SELECT TO public USING (((SELECT auth.uid()) = user_uuid));

DROP POLICY IF EXISTS user_ui_prefs_users_update_own ON public.user_ui_prefs;
CREATE POLICY user_ui_prefs_users_update_own ON public.user_ui_prefs AS PERMISSIVE FOR UPDATE TO public USING (((SELECT auth.uid()) = user_uuid));

-- user_uuid_history (2 policies)
DROP POLICY IF EXISTS uuh_insert_superadmin ON public.user_uuid_history;
CREATE POLICY uuh_insert_superadmin ON public.user_uuid_history AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS uuh_select_superadmin ON public.user_uuid_history;
CREATE POLICY uuh_select_superadmin ON public.user_uuid_history AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

-- user_win_banner_state (3 policies)
DROP POLICY IF EXISTS user_win_banner_state_users_insert_own ON public.user_win_banner_state;
CREATE POLICY user_win_banner_state_users_insert_own ON public.user_win_banner_state AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_uuid));

DROP POLICY IF EXISTS user_win_banner_state_users_select_own ON public.user_win_banner_state;
CREATE POLICY user_win_banner_state_users_select_own ON public.user_win_banner_state AS PERMISSIVE FOR SELECT TO public USING (((SELECT auth.uid()) = user_uuid));

DROP POLICY IF EXISTS user_win_banner_state_users_update_own ON public.user_win_banner_state;
CREATE POLICY user_win_banner_state_users_update_own ON public.user_win_banner_state AS PERMISSIVE FOR UPDATE TO public USING (((SELECT auth.uid()) = user_uuid));

-- users (6 policies)
DROP POLICY IF EXISTS users_manage_superadmin ON public.users;
CREATE POLICY users_manage_superadmin ON public.users AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users AS PERMISSIVE FOR SELECT TO authenticated USING ((user_uuid = (SELECT auth.uid())));

DROP POLICY IF EXISTS users_select_same_tenant ON public.users;
CREATE POLICY users_select_same_tenant ON public.users AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.user_id = (SELECT auth.uid())) AND (tm.status = 'active'::text) AND (tm.tenant_id = users.tenant_id)))));

DROP POLICY IF EXISTS users_select_staff ON public.users;
CREATE POLICY users_select_staff ON public.users AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_uuid = (SELECT auth.uid()))) WITH CHECK (((user_uuid = (SELECT auth.uid())) AND user_protected_fields_unchanged_safe((SELECT auth.uid()), unicorn_role, is_vivacity_internal, global_role, superadmin_level, tenant_id)));

DROP POLICY IF EXISTS users_update_staff ON public.users;
CREATE POLICY users_update_staff ON public.users AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

-- vector_embeddings (2 policies)
DROP POLICY IF EXISTS vector_embeddings_read_vivacity ON public.vector_embeddings;
CREATE POLICY vector_embeddings_read_vivacity ON public.vector_embeddings AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vector_embeddings_write_superadmin ON public.vector_embeddings;
CREATE POLICY vector_embeddings_write_superadmin ON public.vector_embeddings AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

-- vector_index_logs (2 policies)
DROP POLICY IF EXISTS vector_index_logs_read_vivacity ON public.vector_index_logs;
CREATE POLICY vector_index_logs_read_vivacity ON public.vector_index_logs AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vector_index_logs_write_superadmin ON public.vector_index_logs;
CREATE POLICY vector_index_logs_write_superadmin ON public.vector_index_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

-- workflow_optimisation_signals (2 policies)
DROP POLICY IF EXISTS vivacity_staff_select_wos ON public.workflow_optimisation_signals;
CREATE POLICY vivacity_staff_select_wos ON public.workflow_optimisation_signals AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_staff_update_wos ON public.workflow_optimisation_signals;
CREATE POLICY vivacity_staff_update_wos ON public.workflow_optimisation_signals AS PERMISSIVE FOR UPDATE TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- workflow_performance_metrics (1 policy)
DROP POLICY IF EXISTS vivacity_staff_select_wpm ON public.workflow_performance_metrics;
CREATE POLICY vivacity_staff_select_wpm ON public.workflow_performance_metrics AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- workload_snapshots (2 policies)
DROP POLICY IF EXISTS workload_snapshots_insert_system ON public.workload_snapshots;
CREATE POLICY workload_snapshots_insert_system ON public.workload_snapshots AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS workload_snapshots_select_own ON public.workload_snapshots;
CREATE POLICY workload_snapshots_select_own ON public.workload_snapshots AS PERMISSIVE FOR SELECT TO public USING (((((SELECT auth.uid()))::text = (user_id)::text) OR is_vivacity_team_safe((SELECT auth.uid()))));
