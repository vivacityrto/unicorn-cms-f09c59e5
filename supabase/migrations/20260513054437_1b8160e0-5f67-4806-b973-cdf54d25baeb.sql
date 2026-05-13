-- P1-b: Replace bare auth.uid() with (SELECT auth.uid()) — o% batch (final)
DROP POLICY IF EXISTS "superadmin_manage_oauth_states" ON public.oauth_states;
CREATE POLICY "superadmin_manage_oauth_states" ON public.oauth_states AS PERMISSIVE FOR ALL TO authenticated USING (is_super_admin_safe((SELECT auth.uid()))) WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "superadmin_select_oauth_states" ON public.oauth_states;
CREATE POLICY "superadmin_select_oauth_states" ON public.oauth_states AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "oauth_tokens_users_delete_own" ON public.oauth_tokens;
CREATE POLICY "oauth_tokens_users_delete_own" ON public.oauth_tokens AS PERMISSIVE FOR DELETE TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "oauth_tokens_users_insert_own" ON public.oauth_tokens;
CREATE POLICY "oauth_tokens_users_insert_own" ON public.oauth_tokens AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "oauth_tokens_users_update_own" ON public.oauth_tokens;
CREATE POLICY "oauth_tokens_users_update_own" ON public.oauth_tokens AS PERMISSIVE FOR UPDATE TO public USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "superadmin_select_oauth_tokens" ON public.oauth_tokens;
CREATE POLICY "superadmin_select_oauth_tokens" ON public.oauth_tokens AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "ops_time_staff_delete" ON public.ops_time_logs;
CREATE POLICY "ops_time_staff_delete" ON public.ops_time_logs AS PERMISSIVE FOR DELETE TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "ops_time_staff_insert" ON public.ops_time_logs;
CREATE POLICY "ops_time_staff_insert" ON public.ops_time_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "ops_time_staff_select" ON public.ops_time_logs;
CREATE POLICY "ops_time_staff_select" ON public.ops_time_logs AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "ops_time_staff_update" ON public.ops_time_logs;
CREATE POLICY "ops_time_staff_update" ON public.ops_time_logs AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_staff((SELECT auth.uid()))) WITH CHECK (is_vivacity_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "ops_work_staff_delete" ON public.ops_work_items;
CREATE POLICY "ops_work_staff_delete" ON public.ops_work_items AS PERMISSIVE FOR DELETE TO authenticated USING ((is_vivacity_staff((SELECT auth.uid())) AND ((tenant_id IS NULL) OR can_access_tenant((SELECT auth.uid()), tenant_id))));

DROP POLICY IF EXISTS "ops_work_staff_insert" ON public.ops_work_items;
CREATE POLICY "ops_work_staff_insert" ON public.ops_work_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_staff((SELECT auth.uid())) AND ((tenant_id IS NULL) OR can_access_tenant((SELECT auth.uid()), tenant_id))));

DROP POLICY IF EXISTS "ops_work_staff_select" ON public.ops_work_items;
CREATE POLICY "ops_work_staff_select" ON public.ops_work_items AS PERMISSIVE FOR SELECT TO authenticated USING ((is_vivacity_staff((SELECT auth.uid())) AND ((tenant_id IS NULL) OR can_access_tenant((SELECT auth.uid()), tenant_id))));

DROP POLICY IF EXISTS "ops_work_staff_update" ON public.ops_work_items;
CREATE POLICY "ops_work_staff_update" ON public.ops_work_items AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_vivacity_staff((SELECT auth.uid())) AND ((tenant_id IS NULL) OR can_access_tenant((SELECT auth.uid()), tenant_id)))) WITH CHECK ((is_vivacity_staff((SELECT auth.uid())) AND ((tenant_id IS NULL) OR can_access_tenant((SELECT auth.uid()), tenant_id))));