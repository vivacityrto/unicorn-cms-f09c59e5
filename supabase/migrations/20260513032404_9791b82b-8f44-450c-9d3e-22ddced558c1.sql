-- P1-b Batch 07: n% tables (16 policies, 6 tables)

-- notes
DROP POLICY IF EXISTS notes_manage ON public.notes;
CREATE POLICY notes_manage ON public.notes AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid())))) WITH CHECK ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS notes_select ON public.notes;
CREATE POLICY notes_select ON public.notes AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid())) OR has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS notes_tenant_delete ON public.notes;
CREATE POLICY notes_tenant_delete ON public.notes AS PERMISSIVE FOR DELETE TO public USING (((created_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM tenant_users
  WHERE ((tenant_users.user_id = (SELECT auth.uid())) AND (tenant_users.tenant_id = notes.tenant_id) AND (tenant_users.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));

DROP POLICY IF EXISTS notes_tenant_insert ON public.notes;
CREATE POLICY notes_tenant_insert ON public.notes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_has_tenant_access(tenant_id) AND (created_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS notes_tenant_update ON public.notes;
CREATE POLICY notes_tenant_update ON public.notes AS PERMISSIVE FOR UPDATE TO public USING (((created_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM tenant_users
  WHERE ((tenant_users.user_id = (SELECT auth.uid())) AND (tenant_users.tenant_id = notes.tenant_id) AND (tenant_users.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));

-- notification_audit_log
DROP POLICY IF EXISTS notification_audit_log_superadmin_select ON public.notification_audit_log;
CREATE POLICY notification_audit_log_superadmin_select ON public.notification_audit_log AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_user((SELECT auth.uid())));

-- notification_outbox
DROP POLICY IF EXISTS notification_outbox_select ON public.notification_outbox;
CREATE POLICY notification_outbox_select ON public.notification_outbox AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

-- notification_queue
DROP POLICY IF EXISTS notification_queue_users_select_own ON public.notification_queue;
CREATE POLICY notification_queue_users_select_own ON public.notification_queue AS PERMISSIVE FOR SELECT TO public USING ((((SELECT auth.uid()) = user_id) OR is_super_admin()));

-- notification_rules
DROP POLICY IF EXISTS notification_rules_superadmin_select ON public.notification_rules;
CREATE POLICY notification_rules_superadmin_select ON public.notification_rules AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_user((SELECT auth.uid())));

DROP POLICY IF EXISTS notification_rules_users_all_own ON public.notification_rules;
CREATE POLICY notification_rules_users_all_own ON public.notification_rules AS PERMISSIVE FOR ALL TO public USING ((user_uuid = (SELECT auth.uid())));

DROP POLICY IF EXISTS notification_rules_users_select_own ON public.notification_rules;
CREATE POLICY notification_rules_users_select_own ON public.notification_rules AS PERMISSIVE FOR SELECT TO public USING ((user_uuid = (SELECT auth.uid())));

-- notification_schedule
DROP POLICY IF EXISTS notification_schedule_users_select_own ON public.notification_schedule;
CREATE POLICY notification_schedule_users_select_own ON public.notification_schedule AS PERMISSIVE FOR SELECT TO public USING (((user_id = (SELECT auth.uid())) OR is_super_admin()));

DROP POLICY IF EXISTS staff_manage_notifications ON public.notification_schedule;
CREATE POLICY staff_manage_notifications ON public.notification_schedule AS PERMISSIVE FOR ALL TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid()))) WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS users_delete_own_notifications ON public.notification_schedule;
CREATE POLICY users_delete_own_notifications ON public.notification_schedule AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS users_insert_own_notifications ON public.notification_schedule;
CREATE POLICY users_insert_own_notifications ON public.notification_schedule AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS users_update_own_notifications ON public.notification_schedule;
CREATE POLICY users_update_own_notifications ON public.notification_schedule AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));