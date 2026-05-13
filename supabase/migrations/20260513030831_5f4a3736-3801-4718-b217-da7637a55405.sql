-- P1-b Batch 04a: eos_ tables
DROP POLICY IF EXISTS eos_accountability_chart_admin_all ON public.eos_accountability_chart;
CREATE POLICY eos_accountability_chart_admin_all ON public.eos_accountability_chart AS PERMISSIVE FOR ALL TO public USING ((is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin())) WITH CHECK ((is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS eos_accountability_chart_select ON public.eos_accountability_chart;
CREATE POLICY eos_accountability_chart_select ON public.eos_accountability_chart AS PERMISSIVE FOR SELECT TO public USING ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin() OR (tenant_id = get_current_user_tenant())));

DROP POLICY IF EXISTS eos_agenda_template_versions_admin_insert ON public.eos_agenda_template_versions;
CREATE POLICY eos_agenda_template_versions_admin_insert ON public.eos_agenda_template_versions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM (eos_agenda_templates t
     JOIN users u ON ((u.tenant_id = t.tenant_id)))
  WHERE ((t.id = eos_agenda_template_versions.template_id) AND (u.user_uuid = (SELECT auth.uid())) AND (u.user_type = ANY (ARRAY['Vivacity'::user_type_enum, 'Client'::user_type_enum, 'Vivacity Team'::user_type_enum])))))));

DROP POLICY IF EXISTS eos_agenda_template_versions_admin_update ON public.eos_agenda_template_versions;
CREATE POLICY eos_agenda_template_versions_admin_update ON public.eos_agenda_template_versions AS PERMISSIVE FOR UPDATE TO public USING ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM (eos_agenda_templates t
     JOIN users u ON ((u.tenant_id = t.tenant_id)))
  WHERE ((t.id = eos_agenda_template_versions.template_id) AND (u.user_uuid = (SELECT auth.uid())) AND (u.user_type = ANY (ARRAY['Vivacity'::user_type_enum, 'Client'::user_type_enum, 'Vivacity Team'::user_type_enum])))))));

DROP POLICY IF EXISTS eos_agenda_template_versions_tenant_select ON public.eos_agenda_template_versions;
CREATE POLICY eos_agenda_template_versions_tenant_select ON public.eos_agenda_template_versions AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (eos_agenda_templates t
     JOIN users u ON ((u.tenant_id = t.tenant_id)))
  WHERE ((t.id = eos_agenda_template_versions.template_id) AND (u.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS eos_agenda_templates_admin_all ON public.eos_agenda_templates;
CREATE POLICY eos_agenda_templates_admin_all ON public.eos_agenda_templates AS PERMISSIVE FOR ALL TO public USING ((is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin())) WITH CHECK ((is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS eos_agenda_templates_select ON public.eos_agenda_templates;
CREATE POLICY eos_agenda_templates_select ON public.eos_agenda_templates AS PERMISSIVE FOR SELECT TO public USING ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin() OR (tenant_id = get_current_user_tenant())));

DROP POLICY IF EXISTS eos_alerts_admin_update ON public.eos_alerts;
CREATE POLICY eos_alerts_admin_update ON public.eos_alerts AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND ((users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role])) OR (users.tenant_role = 'Admin'::text))))));

DROP POLICY IF EXISTS eos_alerts_authenticated_insert ON public.eos_alerts;
CREATE POLICY eos_alerts_authenticated_insert ON public.eos_alerts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role])))))));

DROP POLICY IF EXISTS eos_alerts_select ON public.eos_alerts;
CREATE POLICY eos_alerts_select ON public.eos_alerts AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_user((SELECT auth.uid())) OR (tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS chart_drafts_insert ON public.eos_chart_drafts;
CREATE POLICY chart_drafts_insert ON public.eos_chart_drafts AS PERMISSIVE FOR INSERT TO public WITH CHECK (((tenant_id = get_current_user_tenant()) AND (is_meeting_participant((SELECT auth.uid()), meeting_id) OR is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin())));

DROP POLICY IF EXISTS chart_drafts_select ON public.eos_chart_drafts;
CREATE POLICY chart_drafts_select ON public.eos_chart_drafts AS PERMISSIVE FOR SELECT TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND (is_meeting_participant((SELECT auth.uid()), meeting_id) OR is_eos_admin((SELECT auth.uid()), tenant_id)))));

DROP POLICY IF EXISTS chart_drafts_update ON public.eos_chart_drafts;
CREATE POLICY chart_drafts_update ON public.eos_chart_drafts AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id = get_current_user_tenant()) AND (is_meeting_participant((SELECT auth.uid()), meeting_id) OR is_eos_admin((SELECT auth.uid()), tenant_id) OR is_super_admin())));

DROP POLICY IF EXISTS eos_flight_plans_admin_all ON public.eos_flight_plans;
CREATE POLICY eos_flight_plans_admin_all ON public.eos_flight_plans AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Admin'::unicorn_role]))))));

DROP POLICY IF EXISTS eos_flight_plans_superadmin_all ON public.eos_flight_plans;
CREATE POLICY eos_flight_plans_superadmin_all ON public.eos_flight_plans AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS eos_flight_plans_tenant_select ON public.eos_flight_plans;
CREATE POLICY eos_flight_plans_tenant_select ON public.eos_flight_plans AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))));

DROP POLICY IF EXISTS eos_function_team_members_vivacity_all ON public.eos_function_team_members;
CREATE POLICY eos_function_team_members_vivacity_all ON public.eos_function_team_members AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role])) AND (u.archived = false))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role])) AND (u.archived = false)))));

DROP POLICY IF EXISTS eos_headlines_client_viewer_select ON public.eos_headlines;
CREATE POLICY eos_headlines_client_viewer_select ON public.eos_headlines AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (users u
     JOIN eos_meetings m ON ((m.client_id = u.client_id)))
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (m.id = eos_headlines.meeting_id) AND has_eos_role((SELECT auth.uid()), m.tenant_id, 'client_viewer'::eos_role)))));

DROP POLICY IF EXISTS eos_headlines_delete ON public.eos_headlines;
CREATE POLICY eos_headlines_delete ON public.eos_headlines AS PERMISSIVE FOR DELETE TO public USING ((is_super_admin() OR (user_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS eos_headlines_insert ON public.eos_headlines;
CREATE POLICY eos_headlines_insert ON public.eos_headlines AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM eos_meetings m
  WHERE ((m.id = eos_headlines.meeting_id) AND ((m.tenant_id = get_current_user_tenant()) OR is_meeting_participant((SELECT auth.uid()), eos_headlines.meeting_id)))))));

DROP POLICY IF EXISTS eos_headlines_select ON public.eos_headlines;
CREATE POLICY eos_headlines_select ON public.eos_headlines AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_user((SELECT auth.uid())) OR is_super_admin() OR is_meeting_participant((SELECT auth.uid()), meeting_id)));

DROP POLICY IF EXISTS eos_headlines_update ON public.eos_headlines;
CREATE POLICY eos_headlines_update ON public.eos_headlines AS PERMISSIVE FOR UPDATE TO public USING ((is_super_admin() OR (user_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS eos_headlines_vivacity_delete ON public.eos_headlines;
CREATE POLICY eos_headlines_vivacity_delete ON public.eos_headlines AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_headlines_vivacity_insert ON public.eos_headlines;
CREATE POLICY eos_headlines_vivacity_insert ON public.eos_headlines AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_team_user((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id()))));

DROP POLICY IF EXISTS eos_headlines_vivacity_update ON public.eos_headlines;
CREATE POLICY eos_headlines_vivacity_update ON public.eos_headlines AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_health_snapshots_select ON public.eos_health_snapshots;
CREATE POLICY eos_health_snapshots_select ON public.eos_health_snapshots AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_user((SELECT auth.uid())) OR (tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS eos_health_snapshots_system_insert ON public.eos_health_snapshots;
CREATE POLICY eos_health_snapshots_system_insert ON public.eos_health_snapshots AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role]))))));

DROP POLICY IF EXISTS eos_issues_client_viewer_select ON public.eos_issues;
CREATE POLICY eos_issues_client_viewer_select ON public.eos_issues AS PERMISSIVE FOR SELECT TO public USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.client_id = eos_issues.client_id) AND has_eos_role((SELECT auth.uid()), eos_issues.tenant_id, 'client_viewer'::eos_role))))));

DROP POLICY IF EXISTS eos_issues_select ON public.eos_issues;
CREATE POLICY eos_issues_select ON public.eos_issues AS PERMISSIVE FOR SELECT TO public USING (((deleted_at IS NULL) AND (is_vivacity_team_user((SELECT auth.uid())) OR is_super_admin() OR has_any_eos_role((SELECT auth.uid()), tenant_id) OR (tenant_id = get_current_user_tenant()))));

DROP POLICY IF EXISTS eos_issues_update ON public.eos_issues;
CREATE POLICY eos_issues_update ON public.eos_issues AS PERMISSIVE FOR UPDATE TO public USING ((is_staff() OR is_super_admin() OR (tenant_id = get_current_user_tenant()) OR (assigned_to = (SELECT auth.uid())) OR (created_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS eos_issues_users_all ON public.eos_issues;
CREATE POLICY eos_issues_users_all ON public.eos_issues AS PERMISSIVE FOR ALL TO public USING ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin())) WITH CHECK ((has_any_eos_role((SELECT auth.uid()), tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS eos_issues_vivacity_delete ON public.eos_issues;
CREATE POLICY eos_issues_vivacity_delete ON public.eos_issues AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_issues_vivacity_insert ON public.eos_issues;
CREATE POLICY eos_issues_vivacity_insert ON public.eos_issues AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_team_user((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id()))));

DROP POLICY IF EXISTS eos_issues_vivacity_update ON public.eos_issues;
CREATE POLICY eos_issues_vivacity_update ON public.eos_issues AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_item_clients_manage ON public.eos_item_clients;
CREATE POLICY eos_item_clients_manage ON public.eos_item_clients AS PERMISSIVE FOR ALL TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND has_any_eos_role((SELECT auth.uid()), tenant_id))));

DROP POLICY IF EXISTS eos_item_clients_select ON public.eos_item_clients;
CREATE POLICY eos_item_clients_select ON public.eos_item_clients AS PERMISSIVE FOR SELECT TO public USING ((is_super_admin() OR (tenant_id = get_current_user_tenant()) OR (client_id = ( SELECT users.client_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS vivacity_delete_attendees ON public.eos_meeting_attendees;
CREATE POLICY vivacity_delete_attendees ON public.eos_meeting_attendees AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_insert_attendees ON public.eos_meeting_attendees;
CREATE POLICY vivacity_insert_attendees ON public.eos_meeting_attendees AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_select_attendees ON public.eos_meeting_attendees;
CREATE POLICY vivacity_select_attendees ON public.eos_meeting_attendees AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_update_attendees ON public.eos_meeting_attendees;
CREATE POLICY vivacity_update_attendees ON public.eos_meeting_attendees AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_meeting_minutes_versions_tenant_insert ON public.eos_meeting_minutes_versions;
CREATE POLICY eos_meeting_minutes_versions_tenant_insert ON public.eos_meeting_minutes_versions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM (eos_meetings m
     JOIN tenant_users tu ON ((tu.tenant_id = m.tenant_id)))
  WHERE ((m.id = eos_meeting_minutes_versions.meeting_id) AND (tu.user_id = (SELECT auth.uid())) AND (tu.role = ANY (ARRAY['SuperAdmin'::text, 'Admin'::text]))))));

DROP POLICY IF EXISTS eos_meeting_minutes_versions_tenant_select ON public.eos_meeting_minutes_versions;
CREATE POLICY eos_meeting_minutes_versions_tenant_select ON public.eos_meeting_minutes_versions AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (eos_meetings m
     JOIN tenant_users tu ON ((tu.tenant_id = m.tenant_id)))
  WHERE ((m.id = eos_meeting_minutes_versions.meeting_id) AND (tu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS eos_meeting_minutes_versions_tenant_update ON public.eos_meeting_minutes_versions;
CREATE POLICY eos_meeting_minutes_versions_tenant_update ON public.eos_meeting_minutes_versions AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM (eos_meetings m
     JOIN tenant_users tu ON ((tu.tenant_id = m.tenant_id)))
  WHERE ((m.id = eos_meeting_minutes_versions.meeting_id) AND (tu.user_id = (SELECT auth.uid())) AND (tu.role = ANY (ARRAY['SuperAdmin'::text, 'Admin'::text]))))));

DROP POLICY IF EXISTS eos_meeting_occurrences_facilitator_all ON public.eos_meeting_occurrences;
CREATE POLICY eos_meeting_occurrences_facilitator_all ON public.eos_meeting_occurrences AS PERMISSIVE FOR ALL TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND (is_eos_admin((SELECT auth.uid()), tenant_id) OR can_facilitate_eos((SELECT auth.uid()), tenant_id))))) WITH CHECK ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND (is_eos_admin((SELECT auth.uid()), tenant_id) OR can_facilitate_eos((SELECT auth.uid()), tenant_id)))));

DROP POLICY IF EXISTS eos_meeting_occurrences_tenant_select ON public.eos_meeting_occurrences;
CREATE POLICY eos_meeting_occurrences_tenant_select ON public.eos_meeting_occurrences AS PERMISSIVE FOR SELECT TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND has_any_eos_role((SELECT auth.uid()), tenant_id))));

DROP POLICY IF EXISTS vivacity_delete_participants ON public.eos_meeting_participants;
CREATE POLICY vivacity_delete_participants ON public.eos_meeting_participants AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_insert_participants ON public.eos_meeting_participants;
CREATE POLICY vivacity_insert_participants ON public.eos_meeting_participants AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_select_participants ON public.eos_meeting_participants;
CREATE POLICY vivacity_select_participants ON public.eos_meeting_participants AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_update_participants ON public.eos_meeting_participants;
CREATE POLICY vivacity_update_participants ON public.eos_meeting_participants AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_meeting_ratings_select_scoped ON public.eos_meeting_ratings;
CREATE POLICY eos_meeting_ratings_select_scoped ON public.eos_meeting_ratings AS PERMISSIVE FOR SELECT TO authenticated USING ((is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS eos_meeting_ratings_users_delete_own ON public.eos_meeting_ratings;
CREATE POLICY eos_meeting_ratings_users_delete_own ON public.eos_meeting_ratings AS PERMISSIVE FOR DELETE TO public USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS eos_meeting_ratings_users_insert_own ON public.eos_meeting_ratings;
CREATE POLICY eos_meeting_ratings_users_insert_own ON public.eos_meeting_ratings AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM eos_meetings m
  WHERE (m.id = eos_meeting_ratings.meeting_id)))));

DROP POLICY IF EXISTS eos_meeting_ratings_users_update_own ON public.eos_meeting_ratings;
CREATE POLICY eos_meeting_ratings_users_update_own ON public.eos_meeting_ratings AS PERMISSIVE FOR UPDATE TO public USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS eos_meeting_recurrences_facilitator_all ON public.eos_meeting_recurrences;
CREATE POLICY eos_meeting_recurrences_facilitator_all ON public.eos_meeting_recurrences AS PERMISSIVE FOR ALL TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND (is_eos_admin((SELECT auth.uid()), tenant_id) OR can_facilitate_eos((SELECT auth.uid()), tenant_id))))) WITH CHECK ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND (is_eos_admin((SELECT auth.uid()), tenant_id) OR can_facilitate_eos((SELECT auth.uid()), tenant_id)))));

DROP POLICY IF EXISTS eos_meeting_recurrences_tenant_select ON public.eos_meeting_recurrences;
CREATE POLICY eos_meeting_recurrences_tenant_select ON public.eos_meeting_recurrences AS PERMISSIVE FOR SELECT TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND has_any_eos_role((SELECT auth.uid()), tenant_id))));

DROP POLICY IF EXISTS eos_meeting_segments_participant_all ON public.eos_meeting_segments;
CREATE POLICY eos_meeting_segments_participant_all ON public.eos_meeting_segments AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM eos_meetings m
  WHERE ((m.id = eos_meeting_segments.meeting_id) AND (has_any_eos_role((SELECT auth.uid()), m.tenant_id) OR is_super_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM eos_meetings m
  WHERE ((m.id = eos_meeting_segments.meeting_id) AND (has_any_eos_role((SELECT auth.uid()), m.tenant_id) OR is_super_admin())))));

DROP POLICY IF EXISTS eos_meeting_segments_select ON public.eos_meeting_segments;
CREATE POLICY eos_meeting_segments_select ON public.eos_meeting_segments AS PERMISSIVE FOR SELECT TO public USING ((is_super_admin() OR is_meeting_participant((SELECT auth.uid()), meeting_id) OR (EXISTS ( SELECT 1
   FROM eos_meetings m
  WHERE ((m.id = eos_meeting_segments.meeting_id) AND has_any_eos_role((SELECT auth.uid()), m.tenant_id))))));

DROP POLICY IF EXISTS meeting_segments_insert ON public.eos_meeting_segments;
CREATE POLICY meeting_segments_insert ON public.eos_meeting_segments AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_super_admin() OR has_meeting_role((SELECT auth.uid()), meeting_id, ARRAY['Leader'::text])));

DROP POLICY IF EXISTS meeting_segments_update ON public.eos_meeting_segments;
CREATE POLICY meeting_segments_update ON public.eos_meeting_segments AS PERMISSIVE FOR UPDATE TO public USING ((is_super_admin() OR has_meeting_role((SELECT auth.uid()), meeting_id, ARRAY['Leader'::text])));

DROP POLICY IF EXISTS eos_meeting_series_select ON public.eos_meeting_series;
CREATE POLICY eos_meeting_series_select ON public.eos_meeting_series AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_user((SELECT auth.uid())) OR (tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS eos_meeting_series_tenant_delete ON public.eos_meeting_series;
CREATE POLICY eos_meeting_series_tenant_delete ON public.eos_meeting_series AS PERMISSIVE FOR DELETE TO public USING ((tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))));

DROP POLICY IF EXISTS eos_meeting_series_tenant_insert ON public.eos_meeting_series;
CREATE POLICY eos_meeting_series_tenant_insert ON public.eos_meeting_series AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))));

DROP POLICY IF EXISTS eos_meeting_series_tenant_update ON public.eos_meeting_series;
CREATE POLICY eos_meeting_series_tenant_update ON public.eos_meeting_series AS PERMISSIVE FOR UPDATE TO public USING ((tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))));

DROP POLICY IF EXISTS eos_meeting_series_vivacity_delete ON public.eos_meeting_series;
CREATE POLICY eos_meeting_series_vivacity_delete ON public.eos_meeting_series AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS eos_meeting_series_vivacity_insert ON public.eos_meeting_series;
CREATE POLICY eos_meeting_series_vivacity_insert ON public.eos_meeting_series AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_team_user((SELECT auth.uid())) AND ((workspace_id IS NULL) OR (workspace_id = get_vivacity_workspace_id()))));

DROP POLICY IF EXISTS eos_meeting_series_vivacity_update ON public.eos_meeting_series;
CREATE POLICY eos_meeting_series_vivacity_update ON public.eos_meeting_series AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_user((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_user((SELECT auth.uid())));