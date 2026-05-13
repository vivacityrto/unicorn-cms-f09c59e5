-- P1-b Batch B+C1: auth.uid() → (SELECT auth.uid()) hardening
DROP POLICY IF EXISTS "behavioural_prompts_staff_delete" ON public.behavioural_prompts;
CREATE POLICY "behavioural_prompts_staff_delete" ON public.behavioural_prompts AS PERMISSIVE FOR DELETE TO authenticated USING ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id)));

DROP POLICY IF EXISTS "behavioural_prompts_staff_insert" ON public.behavioural_prompts;
CREATE POLICY "behavioural_prompts_staff_insert" ON public.behavioural_prompts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id)));

DROP POLICY IF EXISTS "behavioural_prompts_staff_select" ON public.behavioural_prompts;
CREATE POLICY "behavioural_prompts_staff_select" ON public.behavioural_prompts AS PERMISSIVE FOR SELECT TO authenticated USING ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id)));

DROP POLICY IF EXISTS "behavioural_prompts_staff_update" ON public.behavioural_prompts;
CREATE POLICY "behavioural_prompts_staff_update" ON public.behavioural_prompts AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id))) WITH CHECK ((is_vivacity_staff((SELECT auth.uid())) AND can_access_tenant((SELECT auth.uid()), tenant_id)));

DROP POLICY IF EXISTS "bc_insert_staff" ON public.broadcast_campaigns;
CREATE POLICY "bc_insert_staff" ON public.broadcast_campaigns AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "bc_select_staff" ON public.broadcast_campaigns;
CREATE POLICY "bc_select_staff" ON public.broadcast_campaigns AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "bc_update_staff" ON public.broadcast_campaigns;
CREATE POLICY "bc_update_staff" ON public.broadcast_campaigns AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "br_insert_staff" ON public.broadcast_recipients;
CREATE POLICY "br_insert_staff" ON public.broadcast_recipients AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "br_select_staff" ON public.broadcast_recipients;
CREATE POLICY "br_select_staff" ON public.broadcast_recipients AS PERMISSIVE FOR SELECT TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "br_update_staff" ON public.broadcast_recipients;
CREATE POLICY "br_update_staff" ON public.broadcast_recipients AS PERMISSIVE FOR UPDATE TO authenticated USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "calendar_events_delete" ON public.calendar_events;
CREATE POLICY "calendar_events_delete" ON public.calendar_events AS PERMISSIVE FOR DELETE TO authenticated USING (((user_id = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "calendar_events_insert" ON public.calendar_events;
CREATE POLICY "calendar_events_insert" ON public.calendar_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "calendar_events_select_own" ON public.calendar_events;
CREATE POLICY "calendar_events_select_own" ON public.calendar_events AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "calendar_events_select_shared" ON public.calendar_events;
CREATE POLICY "calendar_events_select_shared" ON public.calendar_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM calendar_shares cs
  WHERE ((cs.owner_user_uuid = calendar_events.user_id) AND (cs.viewer_user_uuid = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "calendar_events_select_staff" ON public.calendar_events;
CREATE POLICY "calendar_events_select_staff" ON public.calendar_events AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin_safe((SELECT auth.uid())) OR is_vivacity_team_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "calendar_events_update" ON public.calendar_events;
CREATE POLICY "calendar_events_update" ON public.calendar_events AS PERMISSIVE FOR UPDATE TO authenticated USING (((user_id = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid())))) WITH CHECK (((user_id = (SELECT auth.uid())) OR is_super_admin_safe((SELECT auth.uid()))));

DROP POLICY IF EXISTS "calendar_share_audit_system_insert" ON public.calendar_share_audit;
CREATE POLICY "calendar_share_audit_system_insert" ON public.calendar_share_audit AS PERMISSIVE FOR INSERT TO public WITH CHECK ((performed_by = (SELECT auth.uid())));

DROP POLICY IF EXISTS "calendar_share_audit_users_select_own" ON public.calendar_share_audit;
CREATE POLICY "calendar_share_audit_users_select_own" ON public.calendar_share_audit AS PERMISSIVE FOR SELECT TO public USING (((owner_user_uuid = (SELECT auth.uid())) OR (viewer_user_uuid = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "calendar_shares_owner_delete_own" ON public.calendar_shares;
CREATE POLICY "calendar_shares_owner_delete_own" ON public.calendar_shares AS PERMISSIVE FOR DELETE TO public USING ((owner_user_uuid = (SELECT auth.uid())));

DROP POLICY IF EXISTS "calendar_shares_owner_insert_own" ON public.calendar_shares;
CREATE POLICY "calendar_shares_owner_insert_own" ON public.calendar_shares AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_uuid = (SELECT auth.uid())));

DROP POLICY IF EXISTS "calendar_shares_users_select_own" ON public.calendar_shares;
CREATE POLICY "calendar_shares_users_select_own" ON public.calendar_shares AS PERMISSIVE FOR SELECT TO public USING (((owner_user_uuid = (SELECT auth.uid())) OR (viewer_user_uuid = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "calendar_time_drafts_users_delete_own" ON public.calendar_time_drafts;
CREATE POLICY "calendar_time_drafts_users_delete_own" ON public.calendar_time_drafts AS PERMISSIVE FOR DELETE TO public USING (((SELECT auth.uid()) = created_by));

DROP POLICY IF EXISTS "calendar_time_drafts_users_insert_own" ON public.calendar_time_drafts;
CREATE POLICY "calendar_time_drafts_users_insert_own" ON public.calendar_time_drafts AS PERMISSIVE FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = created_by));

DROP POLICY IF EXISTS "calendar_time_drafts_users_select_own" ON public.calendar_time_drafts;
CREATE POLICY "calendar_time_drafts_users_select_own" ON public.calendar_time_drafts AS PERMISSIVE FOR SELECT TO public USING (((SELECT auth.uid()) = created_by));

DROP POLICY IF EXISTS "calendar_time_drafts_users_update_own" ON public.calendar_time_drafts;
CREATE POLICY "calendar_time_drafts_users_update_own" ON public.calendar_time_drafts AS PERMISSIVE FOR UPDATE TO public USING (((SELECT auth.uid()) = created_by));

DROP POLICY IF EXISTS "celebration_events_authenticated_insert" ON public.celebration_events;
CREATE POLICY "celebration_events_authenticated_insert" ON public.celebration_events AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((SELECT auth.uid()) = actor_user_uuid) AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))));

DROP POLICY IF EXISTS "celebration_events_tenant_select" ON public.celebration_events;
CREATE POLICY "celebration_events_tenant_select" ON public.celebration_events AS PERMISSIVE FOR SELECT TO public USING (has_tenant_access_safe(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "ceo_decision_queue_delete_superadmin" ON public.ceo_decision_queue;
CREATE POLICY "ceo_decision_queue_delete_superadmin" ON public.ceo_decision_queue AS PERMISSIVE FOR DELETE TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "ceo_decision_queue_insert_vivacity" ON public.ceo_decision_queue;
CREATE POLICY "ceo_decision_queue_insert_vivacity" ON public.ceo_decision_queue AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "ceo_decision_queue_select_vivacity" ON public.ceo_decision_queue;
CREATE POLICY "ceo_decision_queue_select_vivacity" ON public.ceo_decision_queue AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS "ceo_decision_queue_update_superadmin" ON public.ceo_decision_queue;
CREATE POLICY "ceo_decision_queue_update_superadmin" ON public.ceo_decision_queue AS PERMISSIVE FOR UPDATE TO public USING (is_super_admin_safe((SELECT auth.uid())));