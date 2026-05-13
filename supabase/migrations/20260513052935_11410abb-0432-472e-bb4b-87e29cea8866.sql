-- P1-b Batch G+H+K+L: auth.uid() → (SELECT auth.uid()) hardening
-- 37 policies, 14 tables

DROP POLICY IF EXISTS "generated_documents_superadmin_all" ON public.generated_documents;
CREATE POLICY "generated_documents_superadmin_all" ON public.generated_documents AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = 'SuperAdmin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = 'SuperAdmin'::text)))));

DROP POLICY IF EXISTS "generated_documents_superadmin_select" ON public.generated_documents;
CREATE POLICY "generated_documents_superadmin_select" ON public.generated_documents AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.user_uuid = (SELECT auth.uid())) AND (users.role = 'SuperAdmin'::text)))));

DROP POLICY IF EXISTS "generated_documents_tenant_select" ON public.generated_documents;
CREATE POLICY "generated_documents_tenant_select" ON public.generated_documents AS PERMISSIVE FOR SELECT TO public USING ((tenant_id IN ( SELECT users.tenant_id
   FROM users
  WHERE (users.user_uuid = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "generated_documents_tenant_select_released" ON public.generated_documents;
CREATE POLICY "generated_documents_tenant_select_released" ON public.generated_documents AS PERMISSIVE FOR SELECT TO authenticated USING (((status = 'released'::text) AND (tenant_id IN ( SELECT t.import_id AS id
   FROM (tenants t
     JOIN tenant_users tu ON ((tu.tenant_id = t.import_id)))
  WHERE (tu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "governance_document_deliveries_tenant_select" ON public.governance_document_deliveries;
CREATE POLICY "governance_document_deliveries_tenant_select" ON public.governance_document_deliveries AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = governance_document_deliveries.tenant_id) AND (tu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "governance_document_deliveries_vivacity_all" ON public.governance_document_deliveries;
CREATE POLICY "governance_document_deliveries_vivacity_all" ON public.governance_document_deliveries AS PERMISSIVE FOR ALL TO public USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "help_messages_insert" ON public.help_messages;
CREATE POLICY "help_messages_insert" ON public.help_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((SELECT auth.uid()) = sender_id) AND (EXISTS ( SELECT 1
   FROM help_threads t
  WHERE ((t.id = help_messages.thread_id) AND ((t.user_id = (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "help_messages_select" ON public.help_messages;
CREATE POLICY "help_messages_select" ON public.help_messages AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM help_threads t
  WHERE ((t.id = help_messages.thread_id) AND ((t.user_id = (SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())))))));

DROP POLICY IF EXISTS "help_threads_insert" ON public.help_threads;
CREATE POLICY "help_threads_insert" ON public.help_threads AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((SELECT auth.uid()) = user_id) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS "help_threads_select" ON public.help_threads;
CREATE POLICY "help_threads_select" ON public.help_threads AS PERMISSIVE FOR SELECT TO public USING ((((SELECT auth.uid()) = user_id) OR is_vivacity_team_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "help_threads_update" ON public.help_threads;
CREATE POLICY "help_threads_update" ON public.help_threads AS PERMISSIVE FOR UPDATE TO public USING ((((SELECT auth.uid()) = user_id) OR is_vivacity_team_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "knowledge_edges_delete_staff" ON public.knowledge_edges;
CREATE POLICY "knowledge_edges_delete_staff" ON public.knowledge_edges AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "knowledge_edges_insert_staff" ON public.knowledge_edges;
CREATE POLICY "knowledge_edges_insert_staff" ON public.knowledge_edges AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "knowledge_edges_select_staff" ON public.knowledge_edges;
CREATE POLICY "knowledge_edges_select_staff" ON public.knowledge_edges AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "knowledge_item_audit_log_superadmin_all" ON public.knowledge_item_audit_log;
CREATE POLICY "knowledge_item_audit_log_superadmin_all" ON public.knowledge_item_audit_log AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin((SELECT auth.uid()))) WITH CHECK (is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "knowledge_item_versions_superadmin_all" ON public.knowledge_item_versions;
CREATE POLICY "knowledge_item_versions_superadmin_all" ON public.knowledge_item_versions AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin((SELECT auth.uid()))) WITH CHECK (is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "knowledge_items_superadmin_manage" ON public.knowledge_items;
CREATE POLICY "knowledge_items_superadmin_manage" ON public.knowledge_items AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin((SELECT auth.uid()))) WITH CHECK (is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "knowledge_items_superadmin_read_approved" ON public.knowledge_items;
CREATE POLICY "knowledge_items_superadmin_read_approved" ON public.knowledge_items AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin((SELECT auth.uid())) AND (approval_status = 'approved'::text)));

DROP POLICY IF EXISTS "knowledge_nodes_delete_staff" ON public.knowledge_nodes;
CREATE POLICY "knowledge_nodes_delete_staff" ON public.knowledge_nodes AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "knowledge_nodes_insert_staff" ON public.knowledge_nodes;
CREATE POLICY "knowledge_nodes_insert_staff" ON public.knowledge_nodes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "knowledge_nodes_select_staff" ON public.knowledge_nodes;
CREATE POLICY "knowledge_nodes_select_staff" ON public.knowledge_nodes AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "knowledge_nodes_select_tenant" ON public.knowledge_nodes;
CREATE POLICY "knowledge_nodes_select_tenant" ON public.knowledge_nodes AS PERMISSIVE FOR SELECT TO authenticated USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "legacy_snapshot_insert_admin" ON public.legacy_login_snapshot;
CREATE POLICY "legacy_snapshot_insert_admin" ON public.legacy_login_snapshot AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "legacy_snapshot_select_own" ON public.legacy_login_snapshot;
CREATE POLICY "legacy_snapshot_select_own" ON public.legacy_login_snapshot AS PERMISSIVE FOR SELECT TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "legacy_snapshot_select_staff" ON public.legacy_login_snapshot;
CREATE POLICY "legacy_snapshot_select_staff" ON public.legacy_login_snapshot AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "lifecycle_checklist_instances_vivacity_all" ON public.lifecycle_checklist_instances;
CREATE POLICY "lifecycle_checklist_instances_vivacity_all" ON public.lifecycle_checklist_instances AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "lifecycle_checklist_instances_vivacity_select" ON public.lifecycle_checklist_instances;
CREATE POLICY "lifecycle_checklist_instances_vivacity_select" ON public.lifecycle_checklist_instances AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "lifecycle_checklist_templates_vivacity_all" ON public.lifecycle_checklist_templates;
CREATE POLICY "lifecycle_checklist_templates_vivacity_all" ON public.lifecycle_checklist_templates AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "lifecycle_checklist_templates_vivacity_select" ON public.lifecycle_checklist_templates;
CREATE POLICY "lifecycle_checklist_templates_vivacity_select" ON public.lifecycle_checklist_templates AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "lookup_list_items_delete_policy" ON public.lookup_list_items;
CREATE POLICY "lookup_list_items_delete_policy" ON public.lookup_list_items AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'team'::text]))))));

DROP POLICY IF EXISTS "lookup_list_items_insert_policy" ON public.lookup_list_items;
CREATE POLICY "lookup_list_items_insert_policy" ON public.lookup_list_items AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'team'::text]))))));

DROP POLICY IF EXISTS "lookup_list_items_select_policy" ON public.lookup_list_items;
CREATE POLICY "lookup_list_items_select_policy" ON public.lookup_list_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM lookup_lists ll
  WHERE ((ll.id = lookup_list_items.list_id) AND ((ll.tenant_id IS NULL) OR (EXISTS ( SELECT 1
          FROM users u
         WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((u.tenant_id = ll.tenant_id) OR (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'team'::text])))))))))));

DROP POLICY IF EXISTS "lookup_list_items_update_policy" ON public.lookup_list_items;
CREATE POLICY "lookup_list_items_update_policy" ON public.lookup_list_items AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'team'::text]))))));

DROP POLICY IF EXISTS "lookup_lists_delete_policy" ON public.lookup_lists;
CREATE POLICY "lookup_lists_delete_policy" ON public.lookup_lists AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "lookup_lists_insert_policy" ON public.lookup_lists;
CREATE POLICY "lookup_lists_insert_policy" ON public.lookup_lists AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'team'::text]))))));

DROP POLICY IF EXISTS "lookup_lists_select_policy" ON public.lookup_lists;
CREATE POLICY "lookup_lists_select_policy" ON public.lookup_lists AS PERMISSIVE FOR SELECT TO public USING (((tenant_id IS NULL) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((u.tenant_id = lookup_lists.tenant_id) OR (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'team'::text]))))))));

DROP POLICY IF EXISTS "lookup_lists_update_policy" ON public.lookup_lists;
CREATE POLICY "lookup_lists_update_policy" ON public.lookup_lists AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.user_uuid = (SELECT auth.uid())) AND (u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'team'::text]))))));
