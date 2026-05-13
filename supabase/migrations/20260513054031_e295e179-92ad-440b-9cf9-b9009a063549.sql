-- P1-b: Replace bare auth.uid() with (SELECT auth.uid()) — m% batch 2
DROP POLICY IF EXISTS "meeting_participants_delete" ON public.meeting_participants;
CREATE POLICY "meeting_participants_delete" ON public.meeting_participants AS PERMISSIVE FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1 FROM meetings m WHERE ((m.id = meeting_participants.meeting_id) AND (m.owner_user_uuid = (SELECT auth.uid()))))) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "meeting_participants_insert" ON public.meeting_participants;
CREATE POLICY "meeting_participants_insert" ON public.meeting_participants AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM meetings m WHERE ((m.id = meeting_participants.meeting_id) AND (m.owner_user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "meeting_participants_select" ON public.meeting_participants;
CREATE POLICY "meeting_participants_select" ON public.meeting_participants AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1 FROM meetings m WHERE ((m.id = meeting_participants.meeting_id) AND ((m.owner_user_uuid = (SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM calendar_shares cs WHERE ((cs.owner_user_uuid = m.owner_user_uuid) AND (cs.viewer_user_uuid = (SELECT auth.uid()))))))))) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "meeting_participants_update" ON public.meeting_participants;
CREATE POLICY "meeting_participants_update" ON public.meeting_participants AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1 FROM meetings m WHERE ((m.id = meeting_participants.meeting_id) AND (m.owner_user_uuid = (SELECT auth.uid()))))) OR is_super_admin_safe((SELECT auth.uid())))) WITH CHECK (((EXISTS ( SELECT 1 FROM meetings m WHERE ((m.id = meeting_participants.meeting_id) AND (m.owner_user_uuid = (SELECT auth.uid()))))) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "meeting_summaries_staff_insert" ON public.meeting_summaries;
CREATE POLICY "meeting_summaries_staff_insert" ON public.meeting_summaries AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "meeting_summaries_staff_select" ON public.meeting_summaries;
CREATE POLICY "meeting_summaries_staff_select" ON public.meeting_summaries AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "meeting_summaries_staff_update" ON public.meeting_summaries;
CREATE POLICY "meeting_summaries_staff_update" ON public.meeting_summaries AS PERMISSIVE FOR UPDATE TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "meeting_sync_audit_users_insert_own" ON public.meeting_sync_audit;
CREATE POLICY "meeting_sync_audit_users_insert_own" ON public.meeting_sync_audit AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "meeting_sync_audit_users_select_own" ON public.meeting_sync_audit;
CREATE POLICY "meeting_sync_audit_users_select_own" ON public.meeting_sync_audit AS PERMISSIVE FOR SELECT TO public USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;
CREATE POLICY "meetings_delete" ON public.meetings AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
CREATE POLICY "meetings_insert" ON public.meetings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((owner_user_uuid = (SELECT auth.uid())) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
CREATE POLICY "meetings_select" ON public.meetings AS PERMISSIVE FOR SELECT TO authenticated USING (((owner_user_uuid = (SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM calendar_shares cs WHERE ((cs.owner_user_uuid = meetings.owner_user_uuid) AND (cs.viewer_user_uuid = (SELECT auth.uid()))))) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
CREATE POLICY "meetings_update" ON public.meetings AS PERMISSIVE FOR UPDATE TO authenticated USING (((owner_user_uuid = (SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM calendar_shares cs WHERE ((cs.owner_user_uuid = meetings.owner_user_uuid) AND (cs.viewer_user_uuid = (SELECT auth.uid())) AND (cs.permission = 'manage'::text)))) OR is_super_admin_safe((SELECT auth.uid())))) WITH CHECK (((owner_user_uuid = (SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM calendar_shares cs WHERE ((cs.owner_user_uuid = meetings.owner_user_uuid) AND (cs.viewer_user_uuid = (SELECT auth.uid())) AND (cs.permission = 'manage'::text)))) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "membership_activity_staff_insert" ON public.membership_activity;
CREATE POLICY "membership_activity_staff_insert" ON public.membership_activity AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS "membership_activity_staff_select" ON public.membership_activity;
CREATE POLICY "membership_activity_staff_select" ON public.membership_activity AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS "membership_ai_suggestions_staff_all" ON public.membership_ai_suggestions;
CREATE POLICY "membership_ai_suggestions_staff_all" ON public.membership_ai_suggestions AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS "membership_ai_suggestions_staff_select" ON public.membership_ai_suggestions;
CREATE POLICY "membership_ai_suggestions_staff_select" ON public.membership_ai_suggestions AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS "mag_insert_vivacity" ON public.membership_allocation_groups;
CREATE POLICY "mag_insert_vivacity" ON public.membership_allocation_groups AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "mag_select_tenant" ON public.membership_allocation_groups;
CREATE POLICY "mag_select_tenant" ON public.membership_allocation_groups AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())));

DROP POLICY IF EXISTS "mag_select_vivacity" ON public.membership_allocation_groups;
CREATE POLICY "mag_select_vivacity" ON public.membership_allocation_groups AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "mag_update_vivacity" ON public.membership_allocation_groups;
CREATE POLICY "mag_update_vivacity" ON public.membership_allocation_groups AS PERMISSIVE FOR UPDATE TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "membership_entitlements_staff_all" ON public.membership_entitlements;
CREATE POLICY "membership_entitlements_staff_all" ON public.membership_entitlements AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS "membership_entitlements_staff_select" ON public.membership_entitlements;
CREATE POLICY "membership_entitlements_staff_select" ON public.membership_entitlements AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS "membership_notes_staff_all" ON public.membership_notes;
CREATE POLICY "membership_notes_staff_all" ON public.membership_notes AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS "membership_notes_staff_select" ON public.membership_notes;
CREATE POLICY "membership_notes_staff_select" ON public.membership_notes AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS "membership_tasks_staff_all" ON public.membership_tasks;
CREATE POLICY "membership_tasks_staff_all" ON public.membership_tasks AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS "membership_tasks_staff_select" ON public.membership_tasks;
CREATE POLICY "membership_tasks_staff_select" ON public.membership_tasks AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS "membership_tier_capacity_config_superadmin_all" ON public.membership_tier_capacity_config;
CREATE POLICY "membership_tier_capacity_config_superadmin_all" ON public.membership_tier_capacity_config AS PERMISSIVE FOR ALL TO public USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "membership_tier_capacity_config_vivacity_select" ON public.membership_tier_capacity_config;
CREATE POLICY "membership_tier_capacity_config_vivacity_select" ON public.membership_tier_capacity_config AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;
CREATE POLICY "messages_delete_own" ON public.messages AS PERMISSIVE FOR DELETE TO public USING ((is_super_admin() OR (sender_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "messages_insert_participant" ON public.messages;
CREATE POLICY "messages_insert_participant" ON public.messages AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_super_admin() OR is_vivacity_team_safe((SELECT auth.uid())) OR ((sender_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1 FROM conversation_participants cp WHERE ((cp.conversation_id = messages.conversation_id) AND (cp.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "messages_select_staff" ON public.messages;
CREATE POLICY "messages_select_staff" ON public.messages AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "messages_select_tenant" ON public.messages;
CREATE POLICY "messages_select_tenant" ON public.messages AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT tu.tenant_id FROM tenant_users tu WHERE (tu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "messages_update_tenant" ON public.messages;
CREATE POLICY "messages_update_tenant" ON public.messages AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id IN ( SELECT tu.tenant_id FROM tenant_users tu WHERE (tu.user_id = (SELECT auth.uid())))) OR is_vivacity_team_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "momentum_state_history_tenant_select" ON public.momentum_state_history;
CREATE POLICY "momentum_state_history_tenant_select" ON public.momentum_state_history AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "momentum_state_history_vivacity_insert" ON public.momentum_state_history;
CREATE POLICY "momentum_state_history_vivacity_insert" ON public.momentum_state_history AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));