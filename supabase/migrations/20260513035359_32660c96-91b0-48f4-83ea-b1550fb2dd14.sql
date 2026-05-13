-- P1-b Batch 11a: t% tables part 1 (tas_ through tenant_merge_data, 67 policies, 21 tables)

-- tas_context_briefs
DROP POLICY IF EXISTS tenant_users_read_approved ON public.tas_context_briefs;
CREATE POLICY tenant_users_read_approved ON public.tas_context_briefs AS PERMISSIVE FOR SELECT TO authenticated USING (((status = 'approved'::text) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS vivacity_team_full_access ON public.tas_context_briefs;
CREATE POLICY vivacity_team_full_access ON public.tas_context_briefs AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

-- tas_context_sources
DROP POLICY IF EXISTS tenant_users_read ON public.tas_context_sources;
CREATE POLICY tenant_users_read ON public.tas_context_sources AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM tas_context_briefs b
  WHERE ((b.id = tas_context_sources.tas_context_brief_id) AND (b.status = 'approved'::text) AND has_tenant_access_safe(b.tenant_id, (SELECT auth.uid()))))));

DROP POLICY IF EXISTS vivacity_team_full_access ON public.tas_context_sources;
CREATE POLICY vivacity_team_full_access ON public.tas_context_sources AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

-- tas_extracts
DROP POLICY IF EXISTS tas_extracts_staff_insert ON public.tas_extracts;
CREATE POLICY tas_extracts_staff_insert ON public.tas_extracts AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tas_extracts_staff_select ON public.tas_extracts;
CREATE POLICY tas_extracts_staff_select ON public.tas_extracts AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tas_extracts_staff_update ON public.tas_extracts;
CREATE POLICY tas_extracts_staff_update ON public.tas_extracts AS PERMISSIVE FOR UPDATE TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tas_extracts_tenant_select ON public.tas_extracts;
CREATE POLICY tas_extracts_tenant_select ON public.tas_extracts AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

-- task_assignments
DROP POLICY IF EXISTS task_assignments_staff_read ON public.task_assignments;
CREATE POLICY task_assignments_staff_read ON public.task_assignments AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS task_assignments_staff_update ON public.task_assignments;
CREATE POLICY task_assignments_staff_update ON public.task_assignments AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_staff((SELECT auth.uid()))) WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS task_assignments_staff_write ON public.task_assignments;
CREATE POLICY task_assignments_staff_write ON public.task_assignments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

-- task_evidence
DROP POLICY IF EXISTS task_evidence_tenant_insert ON public.task_evidence;
CREATE POLICY task_evidence_tenant_insert ON public.task_evidence AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))) AND (uploaded_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS task_evidence_tenant_select ON public.task_evidence;
CREATE POLICY task_evidence_tenant_select ON public.task_evidence AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))));

-- task_tenant_map
DROP POLICY IF EXISTS task_tenant_map_staff_read ON public.task_tenant_map;
CREATE POLICY task_tenant_map_staff_read ON public.task_tenant_map AS PERMISSIVE FOR SELECT TO authenticated USING ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id)));

DROP POLICY IF EXISTS task_tenant_map_staff_update ON public.task_tenant_map;
CREATE POLICY task_tenant_map_staff_update ON public.task_tenant_map AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id))) WITH CHECK ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id)));

DROP POLICY IF EXISTS task_tenant_map_staff_write ON public.task_tenant_map;
CREATE POLICY task_tenant_map_staff_write ON public.task_tenant_map AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id)));

-- tasks_tenants
DROP POLICY IF EXISTS tasks_tenants_tenant_insert_own ON public.tasks_tenants;
CREATE POLICY tasks_tenants_tenant_insert_own ON public.tasks_tenants AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_super_admin() OR (tenant_id = ( SELECT u.tenant_id
   FROM users u
  WHERE (u.user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS tasks_tenants_tenant_select ON public.tasks_tenants;
CREATE POLICY tasks_tenants_tenant_select ON public.tasks_tenants AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))) AND (( SELECT users.user_type
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid()))) = ANY (ARRAY['Client Parent'::user_type_enum, 'Client Child'::user_type_enum]))));

DROP POLICY IF EXISTS tasks_tenants_tenant_update ON public.tasks_tenants;
CREATE POLICY tasks_tenants_tenant_update ON public.tasks_tenants AS PERMISSIVE FOR UPDATE TO authenticated USING (((tenant_id = ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))) AND (( SELECT users.user_type
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid()))) = ANY (ARRAY['Client Parent'::user_type_enum, 'Client Child'::user_type_enum])))) WITH CHECK (((tenant_id = ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))) AND (( SELECT users.user_type
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid()))) = ANY (ARRAY['Client Parent'::user_type_enum, 'Client Child'::user_type_enum]))));

DROP POLICY IF EXISTS tasks_tenants_vivacity_insert ON public.tasks_tenants;
CREATE POLICY tasks_tenants_vivacity_insert ON public.tasks_tenants AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team((SELECT auth.uid())));

DROP POLICY IF EXISTS tasks_tenants_vivacity_select ON public.tasks_tenants;
CREATE POLICY tasks_tenants_vivacity_select ON public.tasks_tenants AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team((SELECT auth.uid())));

DROP POLICY IF EXISTS tasks_tenants_vivacity_update ON public.tasks_tenants;
CREATE POLICY tasks_tenants_vivacity_update ON public.tasks_tenants AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team((SELECT auth.uid()))) WITH CHECK (is_vivacity_team((SELECT auth.uid())));

-- template_analysis_jobs
DROP POLICY IF EXISTS vivacity_insert_template_analysis ON public.template_analysis_jobs;
CREATE POLICY vivacity_insert_template_analysis ON public.template_analysis_jobs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_read_template_analysis ON public.template_analysis_jobs;
CREATE POLICY vivacity_read_template_analysis ON public.template_analysis_jobs AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_update_template_analysis ON public.template_analysis_jobs;
CREATE POLICY vivacity_update_template_analysis ON public.template_analysis_jobs AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- template_clause_mappings
DROP POLICY IF EXISTS vivacity_insert_clause_mappings ON public.template_clause_mappings;
CREATE POLICY vivacity_insert_clause_mappings ON public.template_clause_mappings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_read_clause_mappings ON public.template_clause_mappings;
CREATE POLICY vivacity_read_clause_mappings ON public.template_clause_mappings AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- template_gap_summary
DROP POLICY IF EXISTS vivacity_insert_gap_summary ON public.template_gap_summary;
CREATE POLICY vivacity_insert_gap_summary ON public.template_gap_summary AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_read_gap_summary ON public.template_gap_summary;
CREATE POLICY vivacity_read_gap_summary ON public.template_gap_summary AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- tenant_addresses
DROP POLICY IF EXISTS tenant_addresses_delete ON public.tenant_addresses;
CREATE POLICY tenant_addresses_delete ON public.tenant_addresses AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin() OR is_staff() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = (SELECT auth.uid())) AND (tu.tenant_id = tenant_addresses.tenant_id) AND (tu.role = ANY (ARRAY['admin'::text, 'Admin'::text])))))));

DROP POLICY IF EXISTS tenant_addresses_insert ON public.tenant_addresses;
CREATE POLICY tenant_addresses_insert ON public.tenant_addresses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_super_admin() OR is_staff() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = (SELECT auth.uid())) AND (tu.tenant_id = tenant_addresses.tenant_id) AND (tu.role = ANY (ARRAY['admin'::text, 'Admin'::text])))))));

DROP POLICY IF EXISTS tenant_addresses_update ON public.tenant_addresses;
CREATE POLICY tenant_addresses_update ON public.tenant_addresses AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_super_admin() OR is_staff() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = (SELECT auth.uid())) AND (tu.tenant_id = tenant_addresses.tenant_id) AND (tu.role = ANY (ARRAY['admin'::text, 'Admin'::text]))))))) WITH CHECK ((is_super_admin() OR is_staff() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = (SELECT auth.uid())) AND (tu.tenant_id = tenant_addresses.tenant_id) AND (tu.role = ANY (ARRAY['admin'::text, 'Admin'::text])))))));

-- tenant_commercial_profiles
DROP POLICY IF EXISTS vivacity_staff_delete_commercial_profiles ON public.tenant_commercial_profiles;
CREATE POLICY vivacity_staff_delete_commercial_profiles ON public.tenant_commercial_profiles AS PERMISSIVE FOR DELETE TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_staff_insert_commercial_profiles ON public.tenant_commercial_profiles;
CREATE POLICY vivacity_staff_insert_commercial_profiles ON public.tenant_commercial_profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_staff_select_commercial_profiles ON public.tenant_commercial_profiles;
CREATE POLICY vivacity_staff_select_commercial_profiles ON public.tenant_commercial_profiles AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS vivacity_staff_update_commercial_profiles ON public.tenant_commercial_profiles;
CREATE POLICY vivacity_staff_update_commercial_profiles ON public.tenant_commercial_profiles AS PERMISSIVE FOR UPDATE TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- tenant_compliance_memberships
DROP POLICY IF EXISTS tenant_compliance_memberships_client_select_own ON public.tenant_compliance_memberships;
CREATE POLICY tenant_compliance_memberships_client_select_own ON public.tenant_compliance_memberships AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE ((tm.user_id = (SELECT auth.uid())) AND (tm.status = 'active'::text)))));

DROP POLICY IF EXISTS tenant_compliance_memberships_superadmin_all ON public.tenant_compliance_memberships;
CREATE POLICY tenant_compliance_memberships_superadmin_all ON public.tenant_compliance_memberships AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS tenant_compliance_memberships_vivacity_select ON public.tenant_compliance_memberships;
CREATE POLICY tenant_compliance_memberships_vivacity_select ON public.tenant_compliance_memberships AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

-- tenant_conversations
DROP POLICY IF EXISTS tc_delete_staff ON public.tenant_conversations;
CREATE POLICY tc_delete_staff ON public.tenant_conversations AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tc_insert_auth ON public.tenant_conversations;
CREATE POLICY tc_insert_auth ON public.tenant_conversations AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_super_admin() OR is_vivacity_team_safe((SELECT auth.uid())) OR ((created_by_user_uuid = (SELECT auth.uid())) AND (tenant_id IN ( SELECT tu.tenant_id
   FROM tenant_users tu
  WHERE (tu.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS tc_select_staff ON public.tenant_conversations;
CREATE POLICY tc_select_staff ON public.tenant_conversations AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tc_select_tenant ON public.tenant_conversations;
CREATE POLICY tc_select_tenant ON public.tenant_conversations AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS tc_update_auth ON public.tenant_conversations;
CREATE POLICY tc_update_auth ON public.tenant_conversations AS PERMISSIVE FOR UPDATE TO public USING ((is_super_admin() OR is_vivacity_team_safe((SELECT auth.uid())) OR (tenant_id IN ( SELECT tu.tenant_id
   FROM tenant_users tu
  WHERE (tu.user_id = (SELECT auth.uid()))))));

-- tenant_document_releases
DROP POLICY IF EXISTS tenant_document_releases_tenant_select_own ON public.tenant_document_releases;
CREATE POLICY tenant_document_releases_tenant_select_own ON public.tenant_document_releases AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

-- tenant_document_request_attachments
DROP POLICY IF EXISTS tenant_document_request_attachments_delete ON public.tenant_document_request_attachments;
CREATE POLICY tenant_document_request_attachments_delete ON public.tenant_document_request_attachments AS PERMISSIVE FOR DELETE TO public USING ((has_tenant_access_safe(tenant_id, (SELECT auth.uid())) AND is_vivacity_team_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS tenant_document_request_attachments_insert ON public.tenant_document_request_attachments;
CREATE POLICY tenant_document_request_attachments_insert ON public.tenant_document_request_attachments AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_document_request_attachments_select ON public.tenant_document_request_attachments;
CREATE POLICY tenant_document_request_attachments_select ON public.tenant_document_request_attachments AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

-- tenant_document_requests
DROP POLICY IF EXISTS tenant_document_requests_insert ON public.tenant_document_requests;
CREATE POLICY tenant_document_requests_insert ON public.tenant_document_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_document_requests_select ON public.tenant_document_requests;
CREATE POLICY tenant_document_requests_select ON public.tenant_document_requests AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_document_requests_update ON public.tenant_document_requests;
CREATE POLICY tenant_document_requests_update ON public.tenant_document_requests AS PERMISSIVE FOR UPDATE TO public USING ((((created_by_user_id = (SELECT auth.uid())) AND (status <> ALL (ARRAY['completed'::text, 'cancelled'::text]))) OR (assigned_to_user_id = (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));

-- tenant_documents
DROP POLICY IF EXISTS tenant_documents_delete ON public.tenant_documents;
CREATE POLICY tenant_documents_delete ON public.tenant_documents AS PERMISSIVE FOR DELETE TO authenticated USING ((uploaded_by_user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_documents_insert ON public.tenant_documents;
CREATE POLICY tenant_documents_insert ON public.tenant_documents AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_tenant_access_safe(tenant_id, (SELECT auth.uid())) AND (uploaded_by_user_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS tenant_documents_select ON public.tenant_documents;
CREATE POLICY tenant_documents_select ON public.tenant_documents AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_documents_update ON public.tenant_documents;
CREATE POLICY tenant_documents_update ON public.tenant_documents AS PERMISSIVE FOR UPDATE TO authenticated USING ((uploaded_by_user_id = (SELECT auth.uid()))) WITH CHECK ((uploaded_by_user_id = (SELECT auth.uid())));

-- tenant_engagement_settings
DROP POLICY IF EXISTS tenant_engagement_settings_superadmin_all ON public.tenant_engagement_settings;
CREATE POLICY tenant_engagement_settings_superadmin_all ON public.tenant_engagement_settings AS PERMISSIVE FOR ALL TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_engagement_settings_tenant_select ON public.tenant_engagement_settings;
CREATE POLICY tenant_engagement_settings_tenant_select ON public.tenant_engagement_settings AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

-- tenant_members
DROP POLICY IF EXISTS tenant_members_manage_superadmin ON public.tenant_members;
CREATE POLICY tenant_members_manage_superadmin ON public.tenant_members AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_members_manage_tenant_admin ON public.tenant_members;
CREATE POLICY tenant_members_manage_tenant_admin ON public.tenant_members AS PERMISSIVE FOR ALL TO authenticated USING (has_tenant_admin_safe(tenant_id, (SELECT auth.uid()))) WITH CHECK (has_tenant_admin_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_members_select_own ON public.tenant_members;
CREATE POLICY tenant_members_select_own ON public.tenant_members AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_members_select_staff ON public.tenant_members;
CREATE POLICY tenant_members_select_staff ON public.tenant_members AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- tenant_merge_data
DROP POLICY IF EXISTS tenant_merge_data_superadmin_all ON public.tenant_merge_data;
CREATE POLICY tenant_merge_data_superadmin_all ON public.tenant_merge_data AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS tenant_merge_data_superadmin_select ON public.tenant_merge_data;
CREATE POLICY tenant_merge_data_superadmin_select ON public.tenant_merge_data AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS tenant_merge_data_tenant_insert_own ON public.tenant_merge_data;
CREATE POLICY tenant_merge_data_tenant_insert_own ON public.tenant_merge_data AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = tenant_merge_data.tenant_id) AND (tu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS tenant_merge_data_tenant_select_own ON public.tenant_merge_data;
CREATE POLICY tenant_merge_data_tenant_select_own ON public.tenant_merge_data AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = tenant_merge_data.tenant_id) AND (tu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS tenant_merge_data_tenant_update_own ON public.tenant_merge_data;
CREATE POLICY tenant_merge_data_tenant_update_own ON public.tenant_merge_data AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = tenant_merge_data.tenant_id) AND (tu.user_id = (SELECT auth.uid()))))));