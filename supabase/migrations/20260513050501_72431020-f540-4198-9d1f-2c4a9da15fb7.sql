-- P1-b Batch D: auth.uid() → (SELECT auth.uid()) hardening
-- 69 policies, 45 tables (d%)

DROP POLICY IF EXISTS "dd_access_status_superadmin_all" ON public.dd_access_status;
CREATE POLICY "dd_access_status_superadmin_all" ON public.dd_access_status AS PERMISSIVE FOR ALL TO public USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_accounting_system_admin" ON public.dd_accounting_system;
CREATE POLICY "dd_accounting_system_admin" ON public.dd_accounting_system AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS "dd_ai_analysis_status_superadmin_all" ON public.dd_ai_analysis_status;
CREATE POLICY "dd_ai_analysis_status_superadmin_all" ON public.dd_ai_analysis_status AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_ai_status_superadmin_all" ON public.dd_ai_status;
CREATE POLICY "dd_ai_status_superadmin_all" ON public.dd_ai_status AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_doc_generation_status_superadmin_all" ON public.dd_doc_generation_status;
CREATE POLICY "dd_doc_generation_status_superadmin_all" ON public.dd_doc_generation_status AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_document_status_superadmin_all" ON public.dd_document_status;
CREATE POLICY "dd_document_status_superadmin_all" ON public.dd_document_status AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_eos_roles_superadmin_all" ON public.dd_eos_roles;
CREATE POLICY "dd_eos_roles_superadmin_all" ON public.dd_eos_roles AS PERMISSIVE FOR ALL TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_feature_flag_admin" ON public.dd_feature_flag;
CREATE POLICY "dd_feature_flag_admin" ON public.dd_feature_flag AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS "dd_governance_framework_superadmin_all" ON public.dd_governance_framework;
CREATE POLICY "dd_governance_framework_superadmin_all" ON public.dd_governance_framework AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_lifecycle_category_vivacity_all" ON public.dd_lifecycle_category;
CREATE POLICY "dd_lifecycle_category_vivacity_all" ON public.dd_lifecycle_category AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_lifecycle_responsible_role_vivacity_all" ON public.dd_lifecycle_responsible_role;
CREATE POLICY "dd_lifecycle_responsible_role_vivacity_all" ON public.dd_lifecycle_responsible_role AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_lifecycle_status_superadmin_all" ON public.dd_lifecycle_status;
CREATE POLICY "dd_lifecycle_status_superadmin_all" ON public.dd_lifecycle_status AS PERMISSIVE FOR ALL TO public USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_lifecycle_type_vivacity_all" ON public.dd_lifecycle_type;
CREATE POLICY "dd_lifecycle_type_vivacity_all" ON public.dd_lifecycle_type AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_lms_admin" ON public.dd_lms;
CREATE POLICY "dd_lms_admin" ON public.dd_lms AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS "dd_meeting_attendance_status_vivacity_all" ON public.dd_meeting_attendance_status;
CREATE POLICY "dd_meeting_attendance_status_vivacity_all" ON public.dd_meeting_attendance_status AS PERMISSIVE FOR ALL TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_note_tags_manage" ON public.dd_note_tags;
CREATE POLICY "dd_note_tags_manage" ON public.dd_note_tags AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_org_type_admin" ON public.dd_org_type;
CREATE POLICY "dd_org_type_admin" ON public.dd_org_type AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS "dd_package_type_vivacity_all" ON public.dd_package_type;
CREATE POLICY "dd_package_type_vivacity_all" ON public.dd_package_type AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_phase_status_modify_vivacity" ON public.dd_phase_status;
CREATE POLICY "dd_phase_status_modify_vivacity" ON public.dd_phase_status AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_progress_mode_vivacity_all" ON public.dd_progress_mode;
CREATE POLICY "dd_progress_mode_vivacity_all" ON public.dd_progress_mode AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_sms_admin" ON public.dd_sms;
CREATE POLICY "dd_sms_admin" ON public.dd_sms AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS "dd_suggest_category_manage" ON public.dd_suggest_category;
CREATE POLICY "dd_suggest_category_manage" ON public.dd_suggest_category AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_suggest_impact_rating_manage" ON public.dd_suggest_impact_rating;
CREATE POLICY "dd_suggest_impact_rating_manage" ON public.dd_suggest_impact_rating AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_suggest_item_type_manage" ON public.dd_suggest_item_type;
CREATE POLICY "dd_suggest_item_type_manage" ON public.dd_suggest_item_type AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_suggest_priority_manage" ON public.dd_suggest_priority;
CREATE POLICY "dd_suggest_priority_manage" ON public.dd_suggest_priority AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_suggest_release_status_manage" ON public.dd_suggest_release_status;
CREATE POLICY "dd_suggest_release_status_manage" ON public.dd_suggest_release_status AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "dd_suggest_status_manage" ON public.dd_suggest_status;
CREATE POLICY "dd_suggest_status_manage" ON public.dd_suggest_status AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "usersetup_links_write_superadmin" ON public.dd_usersetup_links;
CREATE POLICY "usersetup_links_write_superadmin" ON public.dd_usersetup_links AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((u.global_role = 'SuperAdmin'::text) OR (u.unicorn_role = 'Super Admin'::unicorn_role)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((u.global_role = 'SuperAdmin'::text) OR (u.unicorn_role = 'Super Admin'::unicorn_role))))));

DROP POLICY IF EXISTS "dd_work_sub_type_vivacity_all" ON public.dd_work_sub_type;
CREATE POLICY "dd_work_sub_type_vivacity_all" ON public.dd_work_sub_type AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_staff((SELECT auth.uid()))) WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "tenant_admin_insert_doc_chunks" ON public.doc_chunks;
CREATE POLICY "tenant_admin_insert_doc_chunks" ON public.doc_chunks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((NOT is_vivacity_team_safe((SELECT auth.uid()))) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = doc_chunks.tenant_id) AND (tm.user_id = (SELECT auth.uid())) AND (tm.role = 'admin'::text) AND (tm.status = 'active'::text))))));

DROP POLICY IF EXISTS "vivacity_staff_insert_doc_chunks" ON public.doc_chunks;
CREATE POLICY "vivacity_staff_insert_doc_chunks" ON public.doc_chunks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "vivacity_staff_select_doc_chunks" ON public.doc_chunks;
CREATE POLICY "vivacity_staff_select_doc_chunks" ON public.doc_chunks AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_select_doc_files" ON public.doc_files;
CREATE POLICY "client_select_doc_files" ON public.doc_files AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT is_vivacity_team_safe((SELECT auth.uid()))) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid())) AND (package_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM package_instances pi
  WHERE ((pi.tenant_id = doc_files.tenant_id) AND (pi.package_id = doc_files.package_id) AND (pi.is_complete = false))))));

DROP POLICY IF EXISTS "tenant_admin_insert_doc_files" ON public.doc_files;
CREATE POLICY "tenant_admin_insert_doc_files" ON public.doc_files AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((NOT is_vivacity_team_safe((SELECT auth.uid()))) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = doc_files.tenant_id) AND (tm.user_id = (SELECT auth.uid())) AND (tm.role = 'admin'::text) AND (tm.status = 'active'::text))))));

DROP POLICY IF EXISTS "tenant_admin_select_doc_files" ON public.doc_files;
CREATE POLICY "tenant_admin_select_doc_files" ON public.doc_files AS PERMISSIVE FOR SELECT TO authenticated USING (((NOT is_vivacity_team_safe((SELECT auth.uid()))) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = doc_files.tenant_id) AND (tm.user_id = (SELECT auth.uid())) AND (tm.role = 'admin'::text) AND (tm.status = 'active'::text))))));

DROP POLICY IF EXISTS "vivacity_staff_insert_doc_files" ON public.doc_files;
CREATE POLICY "vivacity_staff_insert_doc_files" ON public.doc_files AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "vivacity_staff_select_doc_files" ON public.doc_files;
CREATE POLICY "vivacity_staff_select_doc_files" ON public.doc_files AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "document_acknowledgements_superadmin_select" ON public.document_acknowledgements;
CREATE POLICY "document_acknowledgements_superadmin_select" ON public.document_acknowledgements AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "document_acknowledgements_tenant_select" ON public.document_acknowledgements;
CREATE POLICY "document_acknowledgements_tenant_select" ON public.document_acknowledgements AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "document_acknowledgements_users_insert" ON public.document_acknowledgements;
CREATE POLICY "document_acknowledgements_users_insert" ON public.document_acknowledgements AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = (SELECT auth.uid())) AND (tenant_id = ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "document_activity_log_tenant_insert" ON public.document_activity_log;
CREATE POLICY "document_activity_log_tenant_insert" ON public.document_activity_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id IN ( SELECT tenant_users.tenant_id
   FROM tenant_users
  WHERE (tenant_users.user_id = (SELECT auth.uid())))) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role))))));

DROP POLICY IF EXISTS "document_activity_log_tenant_select" ON public.document_activity_log;
CREATE POLICY "document_activity_log_tenant_select" ON public.document_activity_log AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id IN ( SELECT tenant_users.tenant_id
   FROM tenant_users
  WHERE (tenant_users.user_id = (SELECT auth.uid())))) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = 'Super Admin'::unicorn_role))))));

DROP POLICY IF EXISTS "document_ai_audit_users_select" ON public.document_ai_audit;
CREATE POLICY "document_ai_audit_users_select" ON public.document_ai_audit AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM documents d
  WHERE ((d.id = document_ai_audit.document_id) AND has_tenant_access_safe(d.tenant_id, (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "document_data_sources_staff_all" ON public.document_data_sources;
CREATE POLICY "document_data_sources_staff_all" ON public.document_data_sources AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = ANY (ARRAY['Super Admin'::text, 'Team Leader'::text, 'CSC'::text]))))));

DROP POLICY IF EXISTS "document_data_sources_staff_select" ON public.document_data_sources;
CREATE POLICY "document_data_sources_staff_select" ON public.document_data_sources AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM documents d
  WHERE ((d.id = document_data_sources.document_id) AND has_tenant_access_safe(d.tenant_id, (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "document_files_users_insert_own" ON public.document_files;
CREATE POLICY "document_files_users_insert_own" ON public.document_files AS PERMISSIVE FOR INSERT TO public WITH CHECK ((uploaded_by = (SELECT auth.uid())));

DROP POLICY IF EXISTS "document_files_users_select" ON public.document_files;
CREATE POLICY "document_files_users_select" ON public.document_files AS PERMISSIVE FOR SELECT TO public USING ((uploaded_by = (SELECT auth.uid())));

DROP POLICY IF EXISTS "document_generation_errors_superadmin_all" ON public.document_generation_errors;
CREATE POLICY "document_generation_errors_superadmin_all" ON public.document_generation_errors AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "document_generation_errors_tenant_select" ON public.document_generation_errors;
CREATE POLICY "document_generation_errors_tenant_select" ON public.document_generation_errors AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM document_instances di
  WHERE ((di.id = document_generation_errors.documentinstance_id) AND (di.tenant_id IN ( SELECT tu.tenant_id
          FROM tenant_users tu
         WHERE (tu.user_id = (SELECT auth.uid()))))))) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "document_instances_update_admin_or_sa" ON public.document_instances;
CREATE POLICY "document_instances_update_admin_or_sa" ON public.document_instances AS PERMISSIVE FOR UPDATE TO public USING ((is_super_admin() OR is_tenant_admin(tenant_id))) WITH CHECK (((is_super_admin() OR is_tenant_admin(tenant_id)) AND (tenant_is_writeable(tenant_id) OR is_super_admin_safe((SELECT auth.uid())))));

DROP POLICY IF EXISTS "document_instances_write_admin_or_sa" ON public.document_instances;
CREATE POLICY "document_instances_write_admin_or_sa" ON public.document_instances AS PERMISSIVE FOR INSERT TO public WITH CHECK (((is_super_admin() OR is_tenant_admin(tenant_id)) AND (tenant_is_writeable(tenant_id) OR is_super_admin_safe((SELECT auth.uid())))));

DROP POLICY IF EXISTS "document_link_audit_insert_policy" ON public.document_link_audit;
CREATE POLICY "document_link_audit_insert_policy" ON public.document_link_audit AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_uuid = (SELECT auth.uid())));

DROP POLICY IF EXISTS "document_link_audit_select_policy" ON public.document_link_audit;
CREATE POLICY "document_link_audit_select_policy" ON public.document_link_audit AS PERMISSIVE FOR SELECT TO authenticated USING (((user_uuid = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = 'SuperAdmin'::text))))));

DROP POLICY IF EXISTS "document_links_delete" ON public.document_links;
CREATE POLICY "document_links_delete" ON public.document_links AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "document_links_insert" ON public.document_links;
CREATE POLICY "document_links_insert" ON public.document_links AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_uuid = (SELECT auth.uid())) AND has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid()))));

DROP POLICY IF EXISTS "document_links_select" ON public.document_links;
CREATE POLICY "document_links_select" ON public.document_links AS PERMISSIVE FOR SELECT TO authenticated USING (((user_uuid = (SELECT auth.uid())) OR has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid()))));

DROP POLICY IF EXISTS "document_links_update" ON public.document_links;
CREATE POLICY "document_links_update" ON public.document_links AS PERMISSIVE FOR UPDATE TO authenticated USING (((user_uuid = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid())))) WITH CHECK (((user_uuid = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "document_source_mappings_staff_all" ON public.document_source_mappings;
CREATE POLICY "document_source_mappings_staff_all" ON public.document_source_mappings AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = ANY (ARRAY['Super Admin'::text, 'Team Leader'::text, 'CSC'::text]))))));

DROP POLICY IF EXISTS "document_template_mappings_vivacity_delete" ON public.document_template_mappings;
CREATE POLICY "document_template_mappings_vivacity_delete" ON public.document_template_mappings AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.is_vivacity_internal = true)))));

DROP POLICY IF EXISTS "document_template_mappings_vivacity_insert" ON public.document_template_mappings;
CREATE POLICY "document_template_mappings_vivacity_insert" ON public.document_template_mappings AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.is_vivacity_internal = true)))));

DROP POLICY IF EXISTS "document_template_mappings_vivacity_select" ON public.document_template_mappings;
CREATE POLICY "document_template_mappings_vivacity_select" ON public.document_template_mappings AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.is_vivacity_internal = true)))));

DROP POLICY IF EXISTS "document_template_mappings_vivacity_update" ON public.document_template_mappings;
CREATE POLICY "document_template_mappings_vivacity_update" ON public.document_template_mappings AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.is_vivacity_internal = true)))));

DROP POLICY IF EXISTS "document_versions_manage" ON public.document_versions;
CREATE POLICY "document_versions_manage" ON public.document_versions AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM documents d
  WHERE ((d.id = document_versions.document_id) AND has_tenant_access_safe(d.tenant_id, (SELECT auth.uid()))))))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM documents d
  WHERE ((d.id = document_versions.document_id) AND has_tenant_access_safe(d.tenant_id, (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "document_versions_select" ON public.document_versions;
CREATE POLICY "document_versions_select" ON public.document_versions AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM documents d
  WHERE ((d.id = document_versions.document_id) AND has_tenant_access_safe(d.tenant_id, (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "documents_manage" ON public.documents;
CREATE POLICY "documents_manage" ON public.documents AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid())))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS "documents_select" ON public.documents;
CREATE POLICY "documents_select" ON public.documents AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS "documents_stages_manage" ON public.documents_stages;
CREATE POLICY "documents_stages_manage" ON public.documents_stages AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));