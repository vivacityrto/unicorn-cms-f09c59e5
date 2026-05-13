-- P1-b: Replace bare auth.uid() with (SELECT auth.uid()) — m% batch 1
-- Tables: meeting_action_items, meeting_action_tasks, meeting_artifacts,
--         meeting_capture_audit, meeting_minutes, meeting_minutes_ai_runs, meeting_notes

DROP POLICY IF EXISTS "meeting_action_items_users_delete" ON public.meeting_action_items;
CREATE POLICY "meeting_action_items_users_delete" ON public.meeting_action_items AS PERMISSIVE FOR DELETE TO public USING ((created_by = (SELECT auth.uid())));

DROP POLICY IF EXISTS "meeting_action_items_users_insert_own" ON public.meeting_action_items;
CREATE POLICY "meeting_action_items_users_insert_own" ON public.meeting_action_items AS PERMISSIVE FOR INSERT TO public WITH CHECK (((created_by = (SELECT auth.uid())) AND (EXISTS ( SELECT 1 FROM meetings m WHERE ((m.id = meeting_action_items.meeting_id) AND (m.owner_user_uuid = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "meeting_action_items_users_select_own" ON public.meeting_action_items;
CREATE POLICY "meeting_action_items_users_select_own" ON public.meeting_action_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM meetings m WHERE ((m.id = meeting_action_items.meeting_id) AND (m.owner_user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "meeting_action_items_users_update" ON public.meeting_action_items;
CREATE POLICY "meeting_action_items_users_update" ON public.meeting_action_items AS PERMISSIVE FOR UPDATE TO public USING ((created_by = (SELECT auth.uid())));

DROP POLICY IF EXISTS "meeting_action_tasks_superadmin_all" ON public.meeting_action_tasks;
CREATE POLICY "meeting_action_tasks_superadmin_all" ON public.meeting_action_tasks AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = 'SuperAdmin'::text))))) WITH CHECK ((EXISTS ( SELECT 1 FROM users WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = 'SuperAdmin'::text)))));

DROP POLICY IF EXISTS "meeting_action_tasks_users_select_own" ON public.meeting_action_tasks;
CREATE POLICY "meeting_action_tasks_users_select_own" ON public.meeting_action_tasks AS PERMISSIVE FOR SELECT TO public USING ((assigned_to_user_uuid = (SELECT auth.uid())));

DROP POLICY IF EXISTS "meeting_artifacts_delete_staff" ON public.meeting_artifacts;
CREATE POLICY "meeting_artifacts_delete_staff" ON public.meeting_artifacts AS PERMISSIVE FOR DELETE TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "meeting_artifacts_insert_staff_or_owner" ON public.meeting_artifacts;
CREATE POLICY "meeting_artifacts_insert_staff_or_owner" ON public.meeting_artifacts AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_vivacity_team_safe((SELECT auth.uid())) OR (((SELECT auth.uid()) = captured_by) AND (EXISTS ( SELECT 1 FROM meetings m WHERE ((m.id = meeting_artifacts.meeting_id) AND (m.owner_user_uuid = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "meeting_artifacts_select_tenant" ON public.meeting_artifacts;
CREATE POLICY "meeting_artifacts_select_tenant" ON public.meeting_artifacts AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())));

DROP POLICY IF EXISTS "meeting_artifacts_update_staff" ON public.meeting_artifacts;
CREATE POLICY "meeting_artifacts_update_staff" ON public.meeting_artifacts AS PERMISSIVE FOR UPDATE TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "tenant_users_view_shared_artifacts" ON public.meeting_artifacts;
CREATE POLICY "tenant_users_view_shared_artifacts" ON public.meeting_artifacts AS PERMISSIVE FOR SELECT TO public USING (((visibility = 'shared_with_client'::text) AND has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())) AND (NOT is_vivacity_internal_safe((SELECT auth.uid())))));

DROP POLICY IF EXISTS "vivacity_team_manage_artifacts" ON public.meeting_artifacts;
CREATE POLICY "vivacity_team_manage_artifacts" ON public.meeting_artifacts AS PERMISSIVE FOR ALL TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "vivacity_team_view_all_artifacts" ON public.meeting_artifacts;
CREATE POLICY "vivacity_team_view_all_artifacts" ON public.meeting_artifacts AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "meeting_capture_audit_users_select_own" ON public.meeting_capture_audit;
CREATE POLICY "meeting_capture_audit_users_select_own" ON public.meeting_capture_audit AS PERMISSIVE FOR SELECT TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "tenant_users_view_published_minutes" ON public.meeting_minutes;
CREATE POLICY "tenant_users_view_published_minutes" ON public.meeting_minutes AS PERMISSIVE FOR SELECT TO public USING (((status = 'published'::text) AND has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())) AND (NOT is_vivacity_internal_safe((SELECT auth.uid())))));

DROP POLICY IF EXISTS "vivacity_team_manage_minutes" ON public.meeting_minutes;
CREATE POLICY "vivacity_team_manage_minutes" ON public.meeting_minutes AS PERMISSIVE FOR ALL TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "vivacity_team_manage_ai_runs" ON public.meeting_minutes_ai_runs;
CREATE POLICY "vivacity_team_manage_ai_runs" ON public.meeting_minutes_ai_runs AS PERMISSIVE FOR ALL TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "meeting_notes_users_delete_own" ON public.meeting_notes;
CREATE POLICY "meeting_notes_users_delete_own" ON public.meeting_notes AS PERMISSIVE FOR DELETE TO public USING ((created_by = (SELECT auth.uid())));

DROP POLICY IF EXISTS "meeting_notes_users_insert_own" ON public.meeting_notes;
CREATE POLICY "meeting_notes_users_insert_own" ON public.meeting_notes AS PERMISSIVE FOR INSERT TO public WITH CHECK (((created_by = (SELECT auth.uid())) AND (EXISTS ( SELECT 1 FROM meetings m WHERE ((m.id = meeting_notes.meeting_id) AND (m.owner_user_uuid = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "meeting_notes_users_select_own" ON public.meeting_notes;
CREATE POLICY "meeting_notes_users_select_own" ON public.meeting_notes AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM meetings m WHERE ((m.id = meeting_notes.meeting_id) AND (m.owner_user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "meeting_notes_users_update_own" ON public.meeting_notes;
CREATE POLICY "meeting_notes_users_update_own" ON public.meeting_notes AS PERMISSIVE FOR UPDATE TO public USING ((created_by = (SELECT auth.uid())));
