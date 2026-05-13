-- P1-b Batch 10: s% tables (60 policies, 24 tables)

-- scorecard_metric_automation_rules
DROP POLICY IF EXISTS scorecard_metric_automation_rules_vivacity_all ON public.scorecard_metric_automation_rules;
CREATE POLICY scorecard_metric_automation_rules_vivacity_all ON public.scorecard_metric_automation_rules AS PERMISSIVE FOR ALL TO public USING (is_vivacity_team_user((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS scorecard_metric_automation_rules_vivacity_select ON public.scorecard_metric_automation_rules;
CREATE POLICY scorecard_metric_automation_rules_vivacity_select ON public.scorecard_metric_automation_rules AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_user((SELECT auth.uid())));

-- seat_measurable_entries
DROP POLICY IF EXISTS seat_measurable_entries_admin_all ON public.seat_measurable_entries;
CREATE POLICY seat_measurable_entries_admin_all ON public.seat_measurable_entries AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND ((users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role])) OR ((users.tenant_id = seat_measurable_entries.tenant_id) AND (users.unicorn_role = 'Admin'::unicorn_role)))))));

DROP POLICY IF EXISTS seat_measurable_entries_owner_insert_own ON public.seat_measurable_entries;
CREATE POLICY seat_measurable_entries_owner_insert_own ON public.seat_measurable_entries AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM ((seat_measurables sm
     JOIN seat_scorecards ss ON ((sm.seat_scorecard_id = ss.id)))
     JOIN accountability_seat_assignments asa ON ((ss.seat_id = asa.seat_id)))
  WHERE ((sm.id = seat_measurable_entries.seat_measurable_id) AND (asa.user_id = (SELECT auth.uid())) AND (asa.end_date IS NULL) AND user_has_tenant_access(seat_measurable_entries.tenant_id)))) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND ((users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role])) OR ((users.tenant_id = seat_measurable_entries.tenant_id) AND (users.unicorn_role = 'Admin'::unicorn_role))))))));

-- seat_measurables
DROP POLICY IF EXISTS seat_measurables_admin_all ON public.seat_measurables;
CREATE POLICY seat_measurables_admin_all ON public.seat_measurables AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND ((users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role])) OR ((users.tenant_id = seat_measurables.tenant_id) AND (users.unicorn_role = 'Admin'::unicorn_role)))))));

-- seat_meeting_requirements
DROP POLICY IF EXISTS seat_meeting_requirements_staff_select ON public.seat_meeting_requirements;
CREATE POLICY seat_meeting_requirements_staff_select ON public.seat_meeting_requirements AS PERMISSIVE FOR SELECT TO public USING ((is_staff() OR (tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS seat_meeting_requirements_superadmin_all ON public.seat_meeting_requirements;
CREATE POLICY seat_meeting_requirements_superadmin_all ON public.seat_meeting_requirements AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.global_role = 'superadmin'::text)))));

-- seat_rebalancing_recommendations
DROP POLICY IF EXISTS seat_rebalancing_recommendations_manage ON public.seat_rebalancing_recommendations;
CREATE POLICY seat_rebalancing_recommendations_manage ON public.seat_rebalancing_recommendations AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS seat_rebalancing_recommendations_select ON public.seat_rebalancing_recommendations;
CREATE POLICY seat_rebalancing_recommendations_select ON public.seat_rebalancing_recommendations AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid()))));

-- seat_scorecard_versions
DROP POLICY IF EXISTS seat_scorecard_versions_admin_all ON public.seat_scorecard_versions;
CREATE POLICY seat_scorecard_versions_admin_all ON public.seat_scorecard_versions AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND ((users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role])) OR ((users.tenant_id = seat_scorecard_versions.tenant_id) AND (users.unicorn_role = 'Admin'::unicorn_role)))))));

-- seat_scorecards
DROP POLICY IF EXISTS seat_scorecards_admin_all ON public.seat_scorecards;
CREATE POLICY seat_scorecards_admin_all ON public.seat_scorecards AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND ((users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role])) OR ((users.tenant_id = seat_scorecards.tenant_id) AND (users.unicorn_role = 'Admin'::unicorn_role)))))));

-- sharepoint_access_log
DROP POLICY IF EXISTS sharepoint_access_log_insert ON public.sharepoint_access_log;
CREATE POLICY sharepoint_access_log_insert ON public.sharepoint_access_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS sharepoint_access_log_select ON public.sharepoint_access_log;
CREATE POLICY sharepoint_access_log_select ON public.sharepoint_access_log AS PERMISSIVE FOR SELECT TO authenticated USING ((is_vivacity_team_safe((SELECT auth.uid())) OR (user_id = (SELECT auth.uid()))));

-- sharepoint_folder_templates
DROP POLICY IF EXISTS sharepoint_folder_templates_vivacity_all ON public.sharepoint_folder_templates;
CREATE POLICY sharepoint_folder_templates_vivacity_all ON public.sharepoint_folder_templates AS PERMISSIVE FOR ALL TO public USING (is_vivacity_internal_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_internal_safe((SELECT auth.uid())));

-- sharepoint_shared_sources
DROP POLICY IF EXISTS sharepoint_shared_sources_vivacity_all_shared ON public.sharepoint_shared_sources;
CREATE POLICY sharepoint_shared_sources_vivacity_all_shared ON public.sharepoint_shared_sources AS PERMISSIVE FOR ALL TO public USING (is_vivacity_internal_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_internal_safe((SELECT auth.uid())));

-- sharepoint_sites
DROP POLICY IF EXISTS sharepoint_sites_insert_staff ON public.sharepoint_sites;
CREATE POLICY sharepoint_sites_insert_staff ON public.sharepoint_sites AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.is_vivacity_internal = true)))));

DROP POLICY IF EXISTS sharepoint_sites_select_staff ON public.sharepoint_sites;
CREATE POLICY sharepoint_sites_select_staff ON public.sharepoint_sites AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.is_vivacity_internal = true)))));

DROP POLICY IF EXISTS sharepoint_sites_update_staff ON public.sharepoint_sites;
CREATE POLICY sharepoint_sites_update_staff ON public.sharepoint_sites AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.is_vivacity_internal = true)))));

-- sla_policies
DROP POLICY IF EXISTS sla_policies_superadmin_all ON public.sla_policies;
CREATE POLICY sla_policies_superadmin_all ON public.sla_policies AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS sla_policies_vivacity_select ON public.sla_policies;
CREATE POLICY sla_policies_vivacity_select ON public.sla_policies AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

-- srto_corpus
DROP POLICY IF EXISTS srto_corpus_read ON public.srto_corpus;
CREATE POLICY srto_corpus_read ON public.srto_corpus AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE (u.user_uuid = (SELECT auth.uid())))));

-- stage_documents
DROP POLICY IF EXISTS stage_documents_vivacity_all ON public.stage_documents;
CREATE POLICY stage_documents_vivacity_all ON public.stage_documents AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

-- stage_health_rules
DROP POLICY IF EXISTS stage_health_rules_manage_superadmin ON public.stage_health_rules;
CREATE POLICY stage_health_rules_manage_superadmin ON public.stage_health_rules AS PERMISSIVE FOR ALL TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS stage_health_rules_select_vivacity ON public.stage_health_rules;
CREATE POLICY stage_health_rules_select_vivacity ON public.stage_health_rules AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

-- stage_health_snapshots
DROP POLICY IF EXISTS stage_health_snapshots_insert_system ON public.stage_health_snapshots;
CREATE POLICY stage_health_snapshots_insert_system ON public.stage_health_snapshots AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS stage_health_snapshots_select_tenant ON public.stage_health_snapshots;
CREATE POLICY stage_health_snapshots_select_tenant ON public.stage_health_snapshots AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

-- stage_instances
DROP POLICY IF EXISTS stage_instances_lifecycle_insert ON public.stage_instances;
CREATE POLICY stage_instances_lifecycle_insert ON public.stage_instances AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_is_writeable(stage_instance_tenant_id(id)) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS stage_instances_update_via_canonical_helper ON public.stage_instances;
CREATE POLICY stage_instances_update_via_canonical_helper ON public.stage_instances AS PERMISSIVE FOR UPDATE TO authenticated USING ((packageinstance_id IN ( SELECT package_instances.id
   FROM package_instances
  WHERE app.user_can_access_tenant(package_instances.tenant_id)))) WITH CHECK ((tenant_is_writeable(stage_instance_tenant_id(id)) OR is_super_admin_safe((SELECT auth.uid()))));

-- stage_release_items
DROP POLICY IF EXISTS stage_release_items_admin_select ON public.stage_release_items;
CREATE POLICY stage_release_items_admin_select ON public.stage_release_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Admin'::unicorn_role]))))));

DROP POLICY IF EXISTS stage_release_items_tenant_select_released ON public.stage_release_items;
CREATE POLICY stage_release_items_tenant_select_released ON public.stage_release_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM stage_releases sr
  WHERE ((sr.id = stage_release_items.stage_release_id) AND (sr.status = 'released'::text) AND (sr.tenant_id IN ( SELECT users.tenant_id
          FROM users
         WHERE (users.user_uuid = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS stage_release_items_users_select ON public.stage_release_items;
CREATE POLICY stage_release_items_users_select ON public.stage_release_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (stage_releases sr
     JOIN users u ON ((u.user_uuid = (SELECT auth.uid()))))
  WHERE ((sr.id = stage_release_items.stage_release_id) AND ((u.tenant_id = sr.tenant_id) OR (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Admin'::unicorn_role])))))));

-- stage_release_reviews
DROP POLICY IF EXISTS stage_release_reviews_admin_insert ON public.stage_release_reviews;
CREATE POLICY stage_release_reviews_admin_insert ON public.stage_release_reviews AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Admin'::unicorn_role]))))));

DROP POLICY IF EXISTS stage_release_reviews_reviewer_select ON public.stage_release_reviews;
CREATE POLICY stage_release_reviews_reviewer_select ON public.stage_release_reviews AS PERMISSIVE FOR SELECT TO public USING (((reviewer_user_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Admin'::unicorn_role])))))));

DROP POLICY IF EXISTS stage_release_reviews_reviewer_update ON public.stage_release_reviews;
CREATE POLICY stage_release_reviews_reviewer_update ON public.stage_release_reviews AS PERMISSIVE FOR UPDATE TO public USING (((reviewer_user_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Admin'::unicorn_role])))))));

-- stage_releases
DROP POLICY IF EXISTS stage_releases_admin_insert ON public.stage_releases;
CREATE POLICY stage_releases_admin_insert ON public.stage_releases AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Admin'::unicorn_role]))))));

DROP POLICY IF EXISTS stage_releases_admin_select ON public.stage_releases;
CREATE POLICY stage_releases_admin_select ON public.stage_releases AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Admin'::unicorn_role]))))));

DROP POLICY IF EXISTS stage_releases_admin_update ON public.stage_releases;
CREATE POLICY stage_releases_admin_update ON public.stage_releases AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Admin'::unicorn_role]))))));

DROP POLICY IF EXISTS stage_releases_tenant_select ON public.stage_releases;
CREATE POLICY stage_releases_tenant_select ON public.stage_releases AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((u.tenant_id = stage_releases.tenant_id) OR (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Admin'::unicorn_role])))))));

DROP POLICY IF EXISTS stage_releases_tenant_select_released ON public.stage_releases;
CREATE POLICY stage_releases_tenant_select_released ON public.stage_releases AS PERMISSIVE FOR SELECT TO public USING (((status = 'released'::text) AND (tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid()))))));

-- stage_required_evidence_categories
DROP POLICY IF EXISTS vivacity_team_full_access ON public.stage_required_evidence_categories;
CREATE POLICY vivacity_team_full_access ON public.stage_required_evidence_categories AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

-- stage_state_audit_log
DROP POLICY IF EXISTS stage_state_audit_log_tenant_insert ON public.stage_state_audit_log;
CREATE POLICY stage_state_audit_log_tenant_insert ON public.stage_state_audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((stage_state_id IN ( SELECT cpss.id
   FROM client_package_stage_state cpss
  WHERE (cpss.tenant_id IN ( SELECT users.tenant_id
          FROM users
         WHERE (users.user_uuid = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS stage_state_audit_log_tenant_select ON public.stage_state_audit_log;
CREATE POLICY stage_state_audit_log_tenant_select ON public.stage_state_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING ((stage_state_id IN ( SELECT cpss.id
   FROM client_package_stage_state cpss
  WHERE (cpss.tenant_id IN ( SELECT users.tenant_id
          FROM users
         WHERE (users.user_uuid = (SELECT auth.uid())))))));

-- strategic_decision_log
DROP POLICY IF EXISTS vivacity_staff_insert_decisions ON public.strategic_decision_log;
CREATE POLICY vivacity_staff_insert_decisions ON public.strategic_decision_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_staff_select_decisions ON public.strategic_decision_log;
CREATE POLICY vivacity_staff_select_decisions ON public.strategic_decision_log AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- strategic_priorities
DROP POLICY IF EXISTS service_insert_priorities ON public.strategic_priorities;
CREATE POLICY service_insert_priorities ON public.strategic_priorities AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_staff_select_priorities ON public.strategic_priorities;
CREATE POLICY vivacity_staff_select_priorities ON public.strategic_priorities AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_staff_update_priorities ON public.strategic_priorities;
CREATE POLICY vivacity_staff_update_priorities ON public.strategic_priorities AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- strategic_signal_summary
DROP POLICY IF EXISTS strategic_signal_summary_select_vivacity ON public.strategic_signal_summary;
CREATE POLICY strategic_signal_summary_select_vivacity ON public.strategic_signal_summary AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

-- suggest_attachments
DROP POLICY IF EXISTS suggest_attachments_delete ON public.suggest_attachments;
CREATE POLICY suggest_attachments_delete ON public.suggest_attachments AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR (created_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS suggest_attachments_insert ON public.suggest_attachments;
CREATE POLICY suggest_attachments_insert ON public.suggest_attachments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())) AND (created_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS suggest_attachments_select ON public.suggest_attachments;
CREATE POLICY suggest_attachments_select ON public.suggest_attachments AS PERMISSIVE FOR SELECT TO public USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM suggest_items si
  WHERE ((si.id = suggest_attachments.suggest_item_id) AND (si.is_deleted = false) AND (si.is_client_visible = true) AND has_tenant_access_safe((si.tenant_id)::bigint, (SELECT auth.uid())))))));

-- suggest_items
DROP POLICY IF EXISTS suggest_items_insert ON public.suggest_items;
CREATE POLICY suggest_items_insert ON public.suggest_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())) AND (created_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS suggest_items_select ON public.suggest_items;
CREATE POLICY suggest_items_select ON public.suggest_items AS PERMISSIVE FOR SELECT TO public USING (((NOT is_deleted) AND (is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())) AND (is_client_visible = true)))));

DROP POLICY IF EXISTS suggest_items_update ON public.suggest_items;
CREATE POLICY suggest_items_update ON public.suggest_items AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid()))));

-- support_requests
DROP POLICY IF EXISTS support_requests_client_insert ON public.support_requests;
CREATE POLICY support_requests_client_insert ON public.support_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE ((tm.user_id = (SELECT auth.uid())) AND (tm.status = 'active'::text)))));

DROP POLICY IF EXISTS support_requests_tenant_select ON public.support_requests;
CREATE POLICY support_requests_tenant_select ON public.support_requests AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE ((tm.user_id = (SELECT auth.uid())) AND (tm.status = 'active'::text)))));

DROP POLICY IF EXISTS support_requests_vivacity_all ON public.support_requests;
CREATE POLICY support_requests_vivacity_all ON public.support_requests AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS support_requests_vivacity_select ON public.support_requests;
CREATE POLICY support_requests_vivacity_select ON public.support_requests AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

-- system_job_runs
DROP POLICY IF EXISTS system_job_runs_staff_insert ON public.system_job_runs;
CREATE POLICY system_job_runs_staff_insert ON public.system_job_runs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS system_job_runs_staff_read ON public.system_job_runs;
CREATE POLICY system_job_runs_staff_read ON public.system_job_runs AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

-- system_reference_lists
DROP POLICY IF EXISTS system_reference_lists_superadmin_all ON public.system_reference_lists;
CREATE POLICY system_reference_lists_superadmin_all ON public.system_reference_lists AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role)))));