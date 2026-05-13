-- P1-b Batch 08: p% tables (66 policies, 26 tables)

-- package_instance_state_log
DROP POLICY IF EXISTS package_instance_state_log_superadmin_delete ON public.package_instance_state_log;
CREATE POLICY package_instance_state_log_superadmin_delete ON public.package_instance_state_log AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS package_instance_state_log_superadmin_insert ON public.package_instance_state_log;
CREATE POLICY package_instance_state_log_superadmin_insert ON public.package_instance_state_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS package_instance_state_log_superadmin_select ON public.package_instance_state_log;
CREATE POLICY package_instance_state_log_superadmin_select ON public.package_instance_state_log AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = 'super_admin'::text)))));

-- package_phase_requirements
DROP POLICY IF EXISTS package_phase_requirements_superadmin_all ON public.package_phase_requirements;
CREATE POLICY package_phase_requirements_superadmin_all ON public.package_phase_requirements AS PERMISSIVE FOR ALL TO public USING (is_super_admin_safe((SELECT auth.uid())));

-- package_workflow_logs
DROP POLICY IF EXISTS users_insert_own_workflow_logs ON public.package_workflow_logs;
CREATE POLICY users_insert_own_workflow_logs ON public.package_workflow_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((created_by = (SELECT auth.uid())));

-- packages
DROP POLICY IF EXISTS packages_manage ON public.packages;
CREATE POLICY packages_manage ON public.packages AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));

-- pdp_audiences
DROP POLICY IF EXISTS "pdp_audiences: Vivacity staff manage all" ON public.pdp_audiences;
CREATE POLICY "pdp_audiences: Vivacity staff manage all" ON public.pdp_audiences AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

-- pdp_cycles
DROP POLICY IF EXISTS "pdp_cycles: Vivacity staff manage all" ON public.pdp_cycles;
CREATE POLICY "pdp_cycles: Vivacity staff manage all" ON public.pdp_cycles AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

DROP POLICY IF EXISTS "pdp_cycles: manager views assigned" ON public.pdp_cycles;
CREATE POLICY "pdp_cycles: manager views assigned" ON public.pdp_cycles AS PERMISSIVE FOR SELECT TO authenticated USING ((manager_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "pdp_cycles: tenant admins view their tenant" ON public.pdp_cycles;
CREATE POLICY "pdp_cycles: tenant admins view their tenant" ON public.pdp_cycles AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = (SELECT auth.uid())) AND (tu.tenant_id = pdp_cycles.tenant_id) AND (tu.access_scope = 'full'::text) AND (tu.relationship_role = ANY (ARRAY['primary_contact'::tenant_user_role, 'secondary_contact'::tenant_user_role]))))));

DROP POLICY IF EXISTS "pdp_cycles: users insert own" ON public.pdp_cycles;
CREATE POLICY "pdp_cycles: users insert own" ON public.pdp_cycles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = (SELECT auth.uid())) AND (status = ANY (ARRAY['planning'::text, 'active'::text])) AND ((tenant_id IS NULL) OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = (SELECT auth.uid())) AND (tu.tenant_id = pdp_cycles.tenant_id)))))));

DROP POLICY IF EXISTS "pdp_cycles: users update own while open" ON public.pdp_cycles;
CREATE POLICY "pdp_cycles: users update own while open" ON public.pdp_cycles AS PERMISSIVE FOR UPDATE TO authenticated USING (((user_id = (SELECT auth.uid())) AND (status = ANY (ARRAY['planning'::text, 'active'::text, 'under_review'::text])))) WITH CHECK (((user_id = (SELECT auth.uid())) AND (status = ANY (ARRAY['planning'::text, 'active'::text, 'under_review'::text, 'completed'::text])) AND ((completed_by IS NULL) OR (completed_by = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "pdp_cycles: users view own" ON public.pdp_cycles;
CREATE POLICY "pdp_cycles: users view own" ON public.pdp_cycles AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (SELECT auth.uid())));

-- pdp_evidence_items
DROP POLICY IF EXISTS "pdp_evidence: Vivacity staff manage all" ON public.pdp_evidence_items;
CREATE POLICY "pdp_evidence: Vivacity staff manage all" ON public.pdp_evidence_items AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

DROP POLICY IF EXISTS "pdp_evidence: tenant admins view their tenant" ON public.pdp_evidence_items;
CREATE POLICY "pdp_evidence: tenant admins view their tenant" ON public.pdp_evidence_items AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (pdp_cycles c
     JOIN tenant_users tu ON ((tu.tenant_id = c.tenant_id)))
  WHERE ((c.id = pdp_evidence_items.cycle_id) AND (tu.user_id = (SELECT auth.uid())) AND (tu.role = ANY (ARRAY['admin'::text, 'owner'::text]))))));

DROP POLICY IF EXISTS "pdp_evidence: users manage own cycle" ON public.pdp_evidence_items;
CREATE POLICY "pdp_evidence: users manage own cycle" ON public.pdp_evidence_items AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM pdp_cycles c
  WHERE ((c.id = pdp_evidence_items.cycle_id) AND (c.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM pdp_cycles c
  WHERE ((c.id = pdp_evidence_items.cycle_id) AND (c.user_id = (SELECT auth.uid()))))));

-- pdp_goals
DROP POLICY IF EXISTS "pdp_goals: Vivacity staff manage all" ON public.pdp_goals;
CREATE POLICY "pdp_goals: Vivacity staff manage all" ON public.pdp_goals AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

DROP POLICY IF EXISTS "pdp_goals: tenant admins view their tenant" ON public.pdp_goals;
CREATE POLICY "pdp_goals: tenant admins view their tenant" ON public.pdp_goals AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (pdp_cycles c
     JOIN tenant_users tu ON ((tu.tenant_id = c.tenant_id)))
  WHERE ((c.id = pdp_goals.cycle_id) AND (tu.user_id = (SELECT auth.uid())) AND (tu.role = ANY (ARRAY['admin'::text, 'owner'::text]))))));

DROP POLICY IF EXISTS "pdp_goals: users manage own cycle" ON public.pdp_goals;
CREATE POLICY "pdp_goals: users manage own cycle" ON public.pdp_goals AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM pdp_cycles c
  WHERE ((c.id = pdp_goals.cycle_id) AND (c.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM pdp_cycles c
  WHERE ((c.id = pdp_goals.cycle_id) AND (c.user_id = (SELECT auth.uid()))))));

-- pdp_reflections
DROP POLICY IF EXISTS "pdp_reflections: Vivacity staff manage all" ON public.pdp_reflections;
CREATE POLICY "pdp_reflections: Vivacity staff manage all" ON public.pdp_reflections AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

DROP POLICY IF EXISTS "pdp_reflections: tenant admins view their tenant" ON public.pdp_reflections;
CREATE POLICY "pdp_reflections: tenant admins view their tenant" ON public.pdp_reflections AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (pdp_cycles c
     JOIN tenant_users tu ON ((tu.tenant_id = c.tenant_id)))
  WHERE ((c.id = pdp_reflections.cycle_id) AND (tu.user_id = (SELECT auth.uid())) AND (tu.role = ANY (ARRAY['admin'::text, 'owner'::text]))))));

DROP POLICY IF EXISTS "pdp_reflections: users manage own" ON public.pdp_reflections;
CREATE POLICY "pdp_reflections: users manage own" ON public.pdp_reflections AS PERMISSIVE FOR ALL TO authenticated USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));

-- pdp_reviews
DROP POLICY IF EXISTS "pdp_reviews: Vivacity staff manage all" ON public.pdp_reviews;
CREATE POLICY "pdp_reviews: Vivacity staff manage all" ON public.pdp_reviews AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

DROP POLICY IF EXISTS "pdp_reviews: reviewee views and signs own" ON public.pdp_reviews;
CREATE POLICY "pdp_reviews: reviewee views and signs own" ON public.pdp_reviews AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM pdp_cycles c
  WHERE ((c.id = pdp_reviews.cycle_id) AND (c.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM pdp_cycles c
  WHERE ((c.id = pdp_reviews.cycle_id) AND (c.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "pdp_reviews: reviewee views own" ON public.pdp_reviews;
CREATE POLICY "pdp_reviews: reviewee views own" ON public.pdp_reviews AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM pdp_cycles c
  WHERE ((c.id = pdp_reviews.cycle_id) AND (c.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "pdp_reviews: reviewer manages own" ON public.pdp_reviews;
CREATE POLICY "pdp_reviews: reviewer manages own" ON public.pdp_reviews AS PERMISSIVE FOR ALL TO authenticated USING ((reviewer_id = (SELECT auth.uid()))) WITH CHECK ((reviewer_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "pdp_reviews: tenant admins view their tenant" ON public.pdp_reviews;
CREATE POLICY "pdp_reviews: tenant admins view their tenant" ON public.pdp_reviews AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (pdp_cycles c
     JOIN tenant_users tu ON ((tu.tenant_id = c.tenant_id)))
  WHERE ((c.id = pdp_reviews.cycle_id) AND (tu.user_id = (SELECT auth.uid())) AND (tu.role = ANY (ARRAY['admin'::text, 'owner'::text]))))));

-- people_analyzer_entries
DROP POLICY IF EXISTS people_analyzer_entries_manage ON public.people_analyzer_entries;
CREATE POLICY people_analyzer_entries_manage ON public.people_analyzer_entries AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid())))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS people_analyzer_entries_select ON public.people_analyzer_entries;
CREATE POLICY people_analyzer_entries_select ON public.people_analyzer_entries AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS people_analyzer_entries_users_select_own ON public.people_analyzer_entries;
CREATE POLICY people_analyzer_entries_users_select_own ON public.people_analyzer_entries AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (SELECT auth.uid())));

-- people_analyzer_trends
DROP POLICY IF EXISTS people_analyzer_trends_users_select_own ON public.people_analyzer_trends;
CREATE POLICY people_analyzer_trends_users_select_own ON public.people_analyzer_trends AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (SELECT auth.uid())));

-- phase_instances
DROP POLICY IF EXISTS phase_instances_modify_vivacity ON public.phase_instances;
CREATE POLICY phase_instances_modify_vivacity ON public.phase_instances AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS phase_instances_select ON public.phase_instances;
CREATE POLICY phase_instances_select ON public.phase_instances AS PERMISSIVE FOR SELECT TO authenticated USING ((is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM (package_instances pi
     JOIN tenant_users tu ON ((tu.tenant_id = pi.tenant_id)))
  WHERE ((pi.id = phase_instances.package_instance_id) AND (tu.user_id = (SELECT auth.uid())))))));

-- phase_requirements
DROP POLICY IF EXISTS phase_requirements_authenticated_select ON public.phase_requirements;
CREATE POLICY phase_requirements_authenticated_select ON public.phase_requirements AS PERMISSIVE FOR SELECT TO public USING (((SELECT auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS phase_requirements_superadmin_delete ON public.phase_requirements;
CREATE POLICY phase_requirements_superadmin_delete ON public.phase_requirements AS PERMISSIVE FOR DELETE TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS phase_requirements_superadmin_insert ON public.phase_requirements;
CREATE POLICY phase_requirements_superadmin_insert ON public.phase_requirements AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS phase_requirements_superadmin_update ON public.phase_requirements;
CREATE POLICY phase_requirements_superadmin_update ON public.phase_requirements AS PERMISSIVE FOR UPDATE TO public USING (is_super_admin_safe((SELECT auth.uid())));

-- phase_stages
DROP POLICY IF EXISTS phase_stages_modify_vivacity ON public.phase_stages;
CREATE POLICY phase_stages_modify_vivacity ON public.phase_stages AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

-- phases
DROP POLICY IF EXISTS phases_modify_vivacity ON public.phases;
CREATE POLICY phases_modify_vivacity ON public.phases AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

-- playbook_activations
DROP POLICY IF EXISTS pb_activations_vivacity_select ON public.playbook_activations;
CREATE POLICY pb_activations_vivacity_select ON public.playbook_activations AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS pb_activations_vivacity_update ON public.playbook_activations;
CREATE POLICY pb_activations_vivacity_update ON public.playbook_activations AS PERMISSIVE FOR UPDATE TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- playbook_steps
DROP POLICY IF EXISTS pb_steps_vivacity_manage ON public.playbook_steps;
CREATE POLICY pb_steps_vivacity_manage ON public.playbook_steps AS PERMISSIVE FOR ALL TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS pb_steps_vivacity_select ON public.playbook_steps;
CREATE POLICY pb_steps_vivacity_select ON public.playbook_steps AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- playbook_triggers
DROP POLICY IF EXISTS pb_triggers_vivacity_manage ON public.playbook_triggers;
CREATE POLICY pb_triggers_vivacity_manage ON public.playbook_triggers AS PERMISSIVE FOR ALL TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS pb_triggers_vivacity_select ON public.playbook_triggers;
CREATE POLICY pb_triggers_vivacity_select ON public.playbook_triggers AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- portal_documents
DROP POLICY IF EXISTS portal_documents_client_update_own ON public.portal_documents;
CREATE POLICY portal_documents_client_update_own ON public.portal_documents AS PERMISSIVE FOR UPDATE TO authenticated USING (((NOT is_staff()) AND user_has_tenant_access(tenant_id) AND (uploaded_by = (SELECT auth.uid())) AND (direction = 'client_to_vivacity'::text)));

-- predictive_operational_risk_snapshots
DROP POLICY IF EXISTS predictive_operational_risk_snapshots_tenant_select ON public.predictive_operational_risk_snapshots;
CREATE POLICY predictive_operational_risk_snapshots_tenant_select ON public.predictive_operational_risk_snapshots AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

-- priority_inbox_actions
DROP POLICY IF EXISTS priority_inbox_actions_owner_only ON public.priority_inbox_actions;
CREATE POLICY priority_inbox_actions_owner_only ON public.priority_inbox_actions AS PERMISSIVE FOR ALL TO authenticated USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS priority_inbox_actions_users_all_own ON public.priority_inbox_actions;
CREATE POLICY priority_inbox_actions_users_all_own ON public.priority_inbox_actions AS PERMISSIVE FOR ALL TO public USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));

-- process_audit_log
DROP POLICY IF EXISTS process_audit_log_system_insert ON public.process_audit_log;
CREATE POLICY process_audit_log_system_insert ON public.process_audit_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE (u.user_uuid = (SELECT auth.uid())))));

DROP POLICY IF EXISTS process_audit_log_users_select ON public.process_audit_log;
CREATE POLICY process_audit_log_users_select ON public.process_audit_log AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Admin'::unicorn_role]))))));

-- process_versions
DROP POLICY IF EXISTS process_versions_insert_via_process ON public.process_versions;
CREATE POLICY process_versions_insert_via_process ON public.process_versions AS PERMISSIVE FOR INSERT TO public WITH CHECK (((EXISTS ( SELECT 1
   FROM processes p
  WHERE ((p.id = process_versions.process_id) AND (p.tenant_id = current_user_tenant())))) AND (current_user_role() = ANY (ARRAY['superadmin'::text, 'admin'::text, 'team_leader'::text])) AND (created_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS process_versions_system_insert ON public.process_versions;
CREATE POLICY process_versions_system_insert ON public.process_versions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Admin'::unicorn_role]))))));

-- processes
DROP POLICY IF EXISTS processes_admin_select ON public.processes;
CREATE POLICY processes_admin_select ON public.processes AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = 'Admin'::unicorn_role) AND ((u.tenant_id IS NULL) OR (u.tenant_id = u.tenant_id))))));

DROP POLICY IF EXISTS processes_superadmin_delete ON public.processes;
CREATE POLICY processes_superadmin_delete ON public.processes AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS processes_superadmin_insert ON public.processes;
CREATE POLICY processes_superadmin_insert ON public.processes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Admin'::unicorn_role]))))));

DROP POLICY IF EXISTS processes_superadmin_select ON public.processes;
CREATE POLICY processes_superadmin_select ON public.processes AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

DROP POLICY IF EXISTS processes_superadmin_update ON public.processes;
CREATE POLICY processes_superadmin_update ON public.processes AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Admin'::unicorn_role]))))));

DROP POLICY IF EXISTS processes_users_select_approved ON public.processes;
CREATE POLICY processes_users_select_approved ON public.processes AS PERMISSIVE FOR SELECT TO public USING (((status = 'approved'::text) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = 'User'::unicorn_role) AND ((u.tenant_id IS NULL) OR (u.tenant_id = u.tenant_id)))))));

-- profiles
DROP POLICY IF EXISTS profiles_delete_own ON public.profiles;
CREATE POLICY profiles_delete_own ON public.profiles AS PERMISSIVE FOR DELETE TO authenticated USING (((user_id = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS profiles_select_same_tenant_admin ON public.profiles;
CREATE POLICY profiles_select_same_tenant_admin ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (users profile_user
     JOIN users current_user_record ON ((current_user_record.user_uuid = (SELECT auth.uid()))))
  WHERE ((profile_user.user_uuid = profiles.user_id) AND (profile_user.tenant_id IS NOT NULL) AND (current_user_record.tenant_id IS NOT NULL) AND (profile_user.tenant_id = current_user_record.tenant_id) AND (COALESCE(current_user_record.role, ''::text) = ANY (ARRAY['admin'::text, 'tenant_admin'::text, 'superadmin'::text]))))));

DROP POLICY IF EXISTS profiles_select_staff ON public.profiles;
CREATE POLICY profiles_select_staff ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (((user_id = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid())))) WITH CHECK (((user_id = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));