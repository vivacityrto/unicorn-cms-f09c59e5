-- P1-b Batch 11b: t% tables part 2 through training_products

-- tenant_message_attachments (5 policies)
DROP POLICY IF EXISTS tma_delete_staff ON public.tenant_message_attachments;
CREATE POLICY tma_delete_staff ON public.tenant_message_attachments AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tma_insert_sender ON public.tenant_message_attachments;
CREATE POLICY tma_insert_sender ON public.tenant_message_attachments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_messages m
  WHERE ((m.id = tenant_message_attachments.message_id) AND (m.sender_user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS tma_insert_staff ON public.tenant_message_attachments;
CREATE POLICY tma_insert_staff ON public.tenant_message_attachments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tma_select_staff ON public.tenant_message_attachments;
CREATE POLICY tma_select_staff ON public.tenant_message_attachments AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tma_select_tenant ON public.tenant_message_attachments;
CREATE POLICY tma_select_tenant ON public.tenant_message_attachments AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM tenant_messages m
  WHERE ((m.id = tenant_message_attachments.message_id) AND has_tenant_access_safe(m.tenant_id, (SELECT auth.uid()))))));

-- tenant_messages (6 policies)
DROP POLICY IF EXISTS tm_delete_staff ON public.tenant_messages;
CREATE POLICY tm_delete_staff ON public.tenant_messages AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tm_insert_staff ON public.tenant_messages;
CREATE POLICY tm_insert_staff ON public.tenant_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tm_insert_tenant ON public.tenant_messages;
CREATE POLICY tm_insert_tenant ON public.tenant_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK (((sender_user_uuid = (SELECT auth.uid())) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid())) AND is_conversation_participant_safe(conversation_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS tm_select_participant ON public.tenant_messages;
CREATE POLICY tm_select_participant ON public.tenant_messages AS PERMISSIVE FOR SELECT TO public USING ((is_vivacity_team_safe((SELECT auth.uid())) OR is_conversation_participant_safe(conversation_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS tm_select_staff ON public.tenant_messages;
CREATE POLICY tm_select_staff ON public.tenant_messages AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tm_update_participant ON public.tenant_messages;
CREATE POLICY tm_update_participant ON public.tenant_messages AS PERMISSIVE FOR UPDATE TO authenticated USING (((sender_user_uuid = (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())))) WITH CHECK (((sender_user_uuid = (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));

-- tenant_notes (2 policies)
DROP POLICY IF EXISTS tenant_notes_delete ON public.tenant_notes;
CREATE POLICY tenant_notes_delete ON public.tenant_notes AS PERMISSIVE FOR DELETE TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND (created_by = (SELECT auth.uid())))));

DROP POLICY IF EXISTS tenant_notes_update ON public.tenant_notes;
CREATE POLICY tenant_notes_update ON public.tenant_notes AS PERMISSIVE FOR UPDATE TO public USING ((is_super_admin() OR ((tenant_id = get_current_user_tenant()) AND (created_by = (SELECT auth.uid())))));

-- tenant_package_burn_forecast (2 policies)
DROP POLICY IF EXISTS burn_forecast_insert_system ON public.tenant_package_burn_forecast;
CREATE POLICY burn_forecast_insert_system ON public.tenant_package_burn_forecast AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS burn_forecast_select_tenant ON public.tenant_package_burn_forecast;
CREATE POLICY burn_forecast_select_tenant ON public.tenant_package_burn_forecast AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

-- tenant_profile (4 policies)
DROP POLICY IF EXISTS tenant_profile_delete ON public.tenant_profile;
CREATE POLICY tenant_profile_delete ON public.tenant_profile AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_profile_insert ON public.tenant_profile;
CREATE POLICY tenant_profile_insert ON public.tenant_profile AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_team_safe((SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS tenant_profile_select ON public.tenant_profile;
CREATE POLICY tenant_profile_select ON public.tenant_profile AS PERMISSIVE FOR SELECT TO authenticated USING ((has_tenant_access_safe(tenant_id, (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS tenant_profile_update ON public.tenant_profile;
CREATE POLICY tenant_profile_update ON public.tenant_profile AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_tenant_access_safe(tenant_id, (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid())))) WITH CHECK ((has_tenant_access_safe(tenant_id, (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

-- tenant_registry_links (2 policies)
DROP POLICY IF EXISTS tenant_registry_links_superadmin_all ON public.tenant_registry_links;
CREATE POLICY tenant_registry_links_superadmin_all ON public.tenant_registry_links AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role]))))));

DROP POLICY IF EXISTS tenant_registry_links_tenant_select_own ON public.tenant_registry_links;
CREATE POLICY tenant_registry_links_tenant_select_own ON public.tenant_registry_links AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.tenant_id = tenant_registry_links.tenant_id)))));

-- tenant_relationships (1 policy)
DROP POLICY IF EXISTS tenant_rel_select_member ON public.tenant_relationships;
CREATE POLICY tenant_rel_select_member ON public.tenant_relationships AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = (SELECT auth.uid())) AND ((tu.tenant_id = tenant_relationships.parent_tenant_id) OR (tu.tenant_id = tenant_relationships.child_tenant_id))))));

-- tenant_retention_forecasts (1 policy)
DROP POLICY IF EXISTS vivacity_staff_select_retention_forecasts ON public.tenant_retention_forecasts;
CREATE POLICY vivacity_staff_select_retention_forecasts ON public.tenant_retention_forecasts AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- tenant_review_sessions (1 policy)
DROP POLICY IF EXISTS vivacity_team_manage_reviews ON public.tenant_review_sessions;
CREATE POLICY vivacity_team_manage_reviews ON public.tenant_review_sessions AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

-- tenant_risk_forecasts (3 policies)
DROP POLICY IF EXISTS risk_forecasts_insert_staff ON public.tenant_risk_forecasts;
CREATE POLICY risk_forecasts_insert_staff ON public.tenant_risk_forecasts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS risk_forecasts_select_staff ON public.tenant_risk_forecasts;
CREATE POLICY risk_forecasts_select_staff ON public.tenant_risk_forecasts AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS risk_forecasts_select_tenant ON public.tenant_risk_forecasts;
CREATE POLICY risk_forecasts_select_tenant ON public.tenant_risk_forecasts AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

-- tenant_rto_scope (2 policies)
DROP POLICY IF EXISTS tga_scope_tenant_read ON public.tenant_rto_scope;
CREATE POLICY tga_scope_tenant_read ON public.tenant_rto_scope AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS tga_scope_vivacity_all ON public.tenant_rto_scope;
CREATE POLICY tga_scope_vivacity_all ON public.tenant_rto_scope AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- tenant_sharepoint_reference_links (2 policies)
DROP POLICY IF EXISTS tenant_sharepoint_reference_links_client_select ON public.tenant_sharepoint_reference_links;
CREATE POLICY tenant_sharepoint_reference_links_client_select ON public.tenant_sharepoint_reference_links AS PERMISSIVE FOR SELECT TO public USING ((has_tenant_access_safe(tenant_id, (SELECT auth.uid())) AND (visibility = 'client'::text)));

DROP POLICY IF EXISTS tenant_sharepoint_reference_links_vivacity_all ON public.tenant_sharepoint_reference_links;
CREATE POLICY tenant_sharepoint_reference_links_vivacity_all ON public.tenant_sharepoint_reference_links AS PERMISSIVE FOR ALL TO public USING (is_vivacity_internal_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_internal_safe((SELECT auth.uid())));

-- tenant_sharepoint_seed_runs (1 policy)
DROP POLICY IF EXISTS tenant_sharepoint_seed_runs_vivacity_all ON public.tenant_sharepoint_seed_runs;
CREATE POLICY tenant_sharepoint_seed_runs_vivacity_all ON public.tenant_sharepoint_seed_runs AS PERMISSIVE FOR ALL TO public USING (is_vivacity_internal_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_internal_safe((SELECT auth.uid())));

-- tenant_sharepoint_settings (6 policies)
DROP POLICY IF EXISTS tenant_sharepoint_delete ON public.tenant_sharepoint_settings;
CREATE POLICY tenant_sharepoint_delete ON public.tenant_sharepoint_settings AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_sharepoint_insert ON public.tenant_sharepoint_settings;
CREATE POLICY tenant_sharepoint_insert ON public.tenant_sharepoint_settings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_sharepoint_select ON public.tenant_sharepoint_settings;
CREATE POLICY tenant_sharepoint_select ON public.tenant_sharepoint_settings AS PERMISSIVE FOR SELECT TO authenticated USING ((is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS tenant_sharepoint_settings_client_select ON public.tenant_sharepoint_settings;
CREATE POLICY tenant_sharepoint_settings_client_select ON public.tenant_sharepoint_settings AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_sharepoint_settings_vivacity_all ON public.tenant_sharepoint_settings;
CREATE POLICY tenant_sharepoint_settings_vivacity_all ON public.tenant_sharepoint_settings AS PERMISSIVE FOR ALL TO public USING (is_vivacity_internal_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_sharepoint_update ON public.tenant_sharepoint_settings;
CREATE POLICY tenant_sharepoint_update ON public.tenant_sharepoint_settings AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

-- tenant_support_inclusions (3 policies)
DROP POLICY IF EXISTS tenant_support_inclusions_client_select_own ON public.tenant_support_inclusions;
CREATE POLICY tenant_support_inclusions_client_select_own ON public.tenant_support_inclusions AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE ((tm.user_id = (SELECT auth.uid())) AND (tm.status = 'active'::text)))));

DROP POLICY IF EXISTS tenant_support_inclusions_superadmin_all ON public.tenant_support_inclusions;
CREATE POLICY tenant_support_inclusions_superadmin_all ON public.tenant_support_inclusions AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = 'Super Admin'::unicorn_role)))));

DROP POLICY IF EXISTS tenant_support_inclusions_vivacity_select ON public.tenant_support_inclusions;
CREATE POLICY tenant_support_inclusions_vivacity_select ON public.tenant_support_inclusions AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role]))))));

-- tenant_task_status (3 policies)
DROP POLICY IF EXISTS tenant_task_status_staff_read ON public.tenant_task_status;
CREATE POLICY tenant_task_status_staff_read ON public.tenant_task_status AS PERMISSIVE FOR SELECT TO authenticated USING ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id)));

DROP POLICY IF EXISTS tenant_task_status_staff_update ON public.tenant_task_status;
CREATE POLICY tenant_task_status_staff_update ON public.tenant_task_status AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id))) WITH CHECK ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id)));

DROP POLICY IF EXISTS tenant_task_status_staff_write ON public.tenant_task_status;
CREATE POLICY tenant_task_status_staff_write ON public.tenant_task_status AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id)));

-- tenant_tier_capacity_config (4 policies)
DROP POLICY IF EXISTS tenant_tier_capacity_config_superadmin_delete ON public.tenant_tier_capacity_config;
CREATE POLICY tenant_tier_capacity_config_superadmin_delete ON public.tenant_tier_capacity_config AS PERMISSIVE FOR DELETE TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_tier_capacity_config_superadmin_insert ON public.tenant_tier_capacity_config;
CREATE POLICY tenant_tier_capacity_config_superadmin_insert ON public.tenant_tier_capacity_config AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_tier_capacity_config_superadmin_update ON public.tenant_tier_capacity_config;
CREATE POLICY tenant_tier_capacity_config_superadmin_update ON public.tenant_tier_capacity_config AS PERMISSIVE FOR UPDATE TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tenant_tier_capacity_config_tenant_select ON public.tenant_tier_capacity_config;
CREATE POLICY tenant_tier_capacity_config_tenant_select ON public.tenant_tier_capacity_config AS PERMISSIVE FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = tenant_tier_capacity_config.tenant_id) AND (tm.user_id = (SELECT auth.uid())) AND (tm.status = 'active'::text)))) OR is_vivacity_team_safe((SELECT auth.uid()))));

-- tenant_users (4 policies)
DROP POLICY IF EXISTS tenant_users_delete ON public.tenant_users;
CREATE POLICY tenant_users_delete ON public.tenant_users AS PERMISSIVE FOR DELETE TO public USING ((is_tenant_parent_safe(tenant_id, (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS tenant_users_insert ON public.tenant_users;
CREATE POLICY tenant_users_insert ON public.tenant_users AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_tenant_parent_safe(tenant_id, (SELECT auth.uid())) OR (NOT tenant_has_any_users_safe(tenant_id))));

DROP POLICY IF EXISTS tenant_users_select ON public.tenant_users;
CREATE POLICY tenant_users_select ON public.tenant_users AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = (SELECT auth.uid())) OR is_tenant_parent_safe(tenant_id, (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_staff((SELECT auth.uid()))));

DROP POLICY IF EXISTS tenant_users_update ON public.tenant_users;
CREATE POLICY tenant_users_update ON public.tenant_users AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_tenant_parent_safe(tenant_id, (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid())))) WITH CHECK ((is_tenant_parent_safe(tenant_id, (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

-- tenants (3 policies)
DROP POLICY IF EXISTS tenants_manage_superadmin ON public.tenants;
CREATE POLICY tenants_manage_superadmin ON public.tenants AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tenants_select_academy_only_users ON public.tenants;
CREATE POLICY tenants_select_academy_only_users ON public.tenants AS PERMISSIVE FOR SELECT TO authenticated USING (((academy_access_enabled = true) AND (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = tenants.id) AND (tu.user_id = (SELECT auth.uid())) AND (tu.access_scope = 'academy_only'::text))))));

DROP POLICY IF EXISTS tenants_update_staff_logo ON public.tenants;
CREATE POLICY tenants_update_staff_logo ON public.tenants AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

-- tga_cache (1 policy)
DROP POLICY IF EXISTS tga_cache_access ON public.tga_cache;
CREATE POLICY tga_cache_access ON public.tga_cache AS PERMISSIVE FOR ALL TO authenticated USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = 'superadmin'::text)))) OR (tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE ((tm.user_id = (SELECT auth.uid())) AND (tm.status = 'active'::text))))));

-- tga_import_audit (3 policies)
DROP POLICY IF EXISTS tga_import_audit_authenticated_insert ON public.tga_import_audit;
CREATE POLICY tga_import_audit_authenticated_insert ON public.tga_import_audit AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS tga_import_audit_superadmin_select ON public.tga_import_audit;
CREATE POLICY tga_import_audit_superadmin_select ON public.tga_import_audit AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.global_role = 'SuperAdmin'::text)))));

DROP POLICY IF EXISTS tga_import_audit_tenant_select ON public.tga_import_audit;
CREATE POLICY tga_import_audit_tenant_select ON public.tga_import_audit AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = (SELECT auth.uid())) AND (tu.tenant_id = tga_import_audit.tenant_id)))));

-- tga_import_runs (2 policies)
DROP POLICY IF EXISTS tga_import_runs_insert ON public.tga_import_runs;
CREATE POLICY tga_import_runs_insert ON public.tga_import_runs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = 'superadmin'::text)))));

DROP POLICY IF EXISTS tga_import_runs_update ON public.tga_import_runs;
CREATE POLICY tga_import_runs_update ON public.tga_import_runs AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = 'superadmin'::text)))));

-- tga_links (4 policies)
DROP POLICY IF EXISTS tga_links_delete ON public.tga_links;
CREATE POLICY tga_links_delete ON public.tga_links AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS tga_links_insert ON public.tga_links;
CREATE POLICY tga_links_insert ON public.tga_links AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS tga_links_select_scoped ON public.tga_links;
CREATE POLICY tga_links_select_scoped ON public.tga_links AS PERMISSIVE FOR SELECT TO authenticated USING ((is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS tga_links_update ON public.tga_links;
CREATE POLICY tga_links_update ON public.tga_links AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

-- tga_rest_sync_jobs (2 policies)
DROP POLICY IF EXISTS tga_sync_tenant_read ON public.tga_rest_sync_jobs;
CREATE POLICY tga_sync_tenant_read ON public.tga_rest_sync_jobs AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS tga_sync_vivacity_all ON public.tga_rest_sync_jobs;
CREATE POLICY tga_sync_vivacity_all ON public.tga_rest_sync_jobs AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- tga_rto_acknowledgements (5 policies)
DROP POLICY IF EXISTS tra_delete_staff ON public.tga_rto_acknowledgements;
CREATE POLICY tra_delete_staff ON public.tga_rto_acknowledgements AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tra_insert_staff ON public.tga_rto_acknowledgements;
CREATE POLICY tra_insert_staff ON public.tga_rto_acknowledgements AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tra_insert_tenant ON public.tga_rto_acknowledgements;
CREATE POLICY tra_insert_tenant ON public.tga_rto_acknowledgements AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((ack_by_user_uuid = (SELECT auth.uid())) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS tra_select_staff ON public.tga_rto_acknowledgements;
CREATE POLICY tra_select_staff ON public.tga_rto_acknowledgements AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tra_select_tenant ON public.tga_rto_acknowledgements;
CREATE POLICY tra_select_tenant ON public.tga_rto_acknowledgements AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

-- tga_rto_addresses (2 policies)
DROP POLICY IF EXISTS tga_addresses_tenant_read ON public.tga_rto_addresses;
CREATE POLICY tga_addresses_tenant_read ON public.tga_rto_addresses AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS tga_addresses_vivacity_all ON public.tga_rto_addresses;
CREATE POLICY tga_addresses_vivacity_all ON public.tga_rto_addresses AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- tga_rto_contacts (2 policies)
DROP POLICY IF EXISTS tga_contacts_tenant_read ON public.tga_rto_contacts;
CREATE POLICY tga_contacts_tenant_read ON public.tga_rto_contacts AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS tga_contacts_vivacity_all ON public.tga_rto_contacts;
CREATE POLICY tga_contacts_vivacity_all ON public.tga_rto_contacts AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- tga_rto_delivery_locations (2 policies)
DROP POLICY IF EXISTS tga_delivery_tenant_read ON public.tga_rto_delivery_locations;
CREATE POLICY tga_delivery_tenant_read ON public.tga_rto_delivery_locations AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS tga_delivery_vivacity_all ON public.tga_rto_delivery_locations;
CREATE POLICY tga_delivery_vivacity_all ON public.tga_rto_delivery_locations AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- tga_rto_flags (5 policies)
DROP POLICY IF EXISTS trf_delete_staff ON public.tga_rto_flags;
CREATE POLICY trf_delete_staff ON public.tga_rto_flags AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS trf_insert_staff ON public.tga_rto_flags;
CREATE POLICY trf_insert_staff ON public.tga_rto_flags AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS trf_select_staff ON public.tga_rto_flags;
CREATE POLICY trf_select_staff ON public.tga_rto_flags AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS trf_select_tenant ON public.tga_rto_flags;
CREATE POLICY trf_select_tenant ON public.tga_rto_flags AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS trf_update_staff ON public.tga_rto_flags;
CREATE POLICY trf_update_staff ON public.tga_rto_flags AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- tga_rto_import_jobs (1 policy)
DROP POLICY IF EXISTS tga_rto_import_jobs_tenant_select_own ON public.tga_rto_import_jobs;
CREATE POLICY tga_rto_import_jobs_tenant_select_own ON public.tga_rto_import_jobs AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND ((users.tenant_id = tga_rto_import_jobs.tenant_id) OR (users.global_role = 'SuperAdmin'::text))))));

-- tga_rto_snapshots (2 policies)
DROP POLICY IF EXISTS tga_snapshots_tenant_read ON public.tga_rto_snapshots;
CREATE POLICY tga_snapshots_tenant_read ON public.tga_rto_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS tga_snapshots_vivacity_all ON public.tga_rto_snapshots;
CREATE POLICY tga_snapshots_vivacity_all ON public.tga_rto_snapshots AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- tga_rto_summary (2 policies)
DROP POLICY IF EXISTS tga_summary_tenant_read ON public.tga_rto_summary;
CREATE POLICY tga_summary_tenant_read ON public.tga_rto_summary AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS tga_summary_vivacity_all ON public.tga_rto_summary;
CREATE POLICY tga_summary_vivacity_all ON public.tga_rto_summary AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

-- tga_scope_courses (1 policy)
DROP POLICY IF EXISTS tga_scope_courses_tenant_select_own ON public.tga_scope_courses;
CREATE POLICY tga_scope_courses_tenant_select_own ON public.tga_scope_courses AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND ((users.tenant_id = tga_scope_courses.tenant_id) OR (users.global_role = 'SuperAdmin'::text))))));

-- tga_scope_qualifications (1 policy)
DROP POLICY IF EXISTS tga_scope_qualifications_tenant_select_own ON public.tga_scope_qualifications;
CREATE POLICY tga_scope_qualifications_tenant_select_own ON public.tga_scope_qualifications AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND ((users.tenant_id = tga_scope_qualifications.tenant_id) OR (users.global_role = 'SuperAdmin'::text))))));

-- tga_scope_skillsets (1 policy)
DROP POLICY IF EXISTS tga_scope_skillsets_tenant_select_own ON public.tga_scope_skillsets;
CREATE POLICY tga_scope_skillsets_tenant_select_own ON public.tga_scope_skillsets AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND ((users.tenant_id = tga_scope_skillsets.tenant_id) OR (users.global_role = 'SuperAdmin'::text))))));

-- tga_scope_units (1 policy)
DROP POLICY IF EXISTS tga_scope_units_tenant_select_own ON public.tga_scope_units;
CREATE POLICY tga_scope_units_tenant_select_own ON public.tga_scope_units AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND ((users.tenant_id = tga_scope_units.tenant_id) OR (users.global_role = 'SuperAdmin'::text))))));

-- time_entries (4 policies)
DROP POLICY IF EXISTS time_entries_delete ON public.time_entries;
CREATE POLICY time_entries_delete ON public.time_entries AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR (user_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS time_entries_insert ON public.time_entries;
CREATE POLICY time_entries_insert ON public.time_entries AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((((user_id = (SELECT auth.uid())) AND has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid()))) OR (is_vivacity_staff((SELECT auth.uid())) AND has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())))));

DROP POLICY IF EXISTS time_entries_select ON public.time_entries;
CREATE POLICY time_entries_select ON public.time_entries AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS time_entries_update ON public.time_entries;
CREATE POLICY time_entries_update ON public.time_entries AS PERMISSIVE FOR UPDATE TO authenticated USING (((user_id = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())))) WITH CHECK (((user_id = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));

-- time_entry_allocations (4 policies)
DROP POLICY IF EXISTS tea_delete_vivacity ON public.time_entry_allocations;
CREATE POLICY tea_delete_vivacity ON public.time_entry_allocations AS PERMISSIVE FOR DELETE TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tea_insert_vivacity ON public.time_entry_allocations;
CREATE POLICY tea_insert_vivacity ON public.time_entry_allocations AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_internal_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS tea_select_tenant ON public.time_entry_allocations;
CREATE POLICY tea_select_tenant ON public.time_entry_allocations AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())));

DROP POLICY IF EXISTS tea_select_vivacity ON public.time_entry_allocations;
CREATE POLICY tea_select_vivacity ON public.time_entry_allocations AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_internal_safe((SELECT auth.uid())));

-- time_entry_audit_log (1 policy)
DROP POLICY IF EXISTS time_entry_audit_log_tenant_select ON public.time_entry_audit_log;
CREATE POLICY time_entry_audit_log_tenant_select ON public.time_entry_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe((tenant_id)::bigint, (SELECT auth.uid())));

-- trainer_matrix_extracts (4 policies)
DROP POLICY IF EXISTS trainer_matrix_extracts_staff_insert ON public.trainer_matrix_extracts;
CREATE POLICY trainer_matrix_extracts_staff_insert ON public.trainer_matrix_extracts AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS trainer_matrix_extracts_staff_select ON public.trainer_matrix_extracts;
CREATE POLICY trainer_matrix_extracts_staff_select ON public.trainer_matrix_extracts AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS trainer_matrix_extracts_staff_update ON public.trainer_matrix_extracts;
CREATE POLICY trainer_matrix_extracts_staff_update ON public.trainer_matrix_extracts AS PERMISSIVE FOR UPDATE TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS trainer_matrix_extracts_tenant_select ON public.trainer_matrix_extracts;
CREATE POLICY trainer_matrix_extracts_tenant_select ON public.trainer_matrix_extracts AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

-- training_products (1 policy)
DROP POLICY IF EXISTS training_products_manage ON public.training_products;
CREATE POLICY training_products_manage ON public.training_products AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));
