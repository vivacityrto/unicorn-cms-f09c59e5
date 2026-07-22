BEGIN;
DROP POLICY IF EXISTS "linked_user_select_own_engagement" ON public.staff_engagements;
CREATE POLICY "linked_user_select_own_engagement"
ON public.staff_engagements AS PERMISSIVE FOR SELECT TO authenticated
USING (linked_unicorn_user_id = (SELECT auth.uid()) AND type = 'offboarding');

DROP POLICY IF EXISTS broadcast_recipients_restrict_staff ON public.broadcast_recipients;
CREATE POLICY broadcast_recipients_restrict_staff
ON public.broadcast_recipients AS RESTRICTIVE FOR ALL TO authenticated
USING (is_vivacity_team_safe((SELECT auth.uid())))
WITH CHECK (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS invitation_tokens_restrict_staff_or_owner ON public.invitation_tokens;
CREATE POLICY invitation_tokens_restrict_staff_or_owner
ON public.invitation_tokens AS RESTRICTIVE FOR ALL TO authenticated
USING (is_super_admin() OR email = current_user_email())
WITH CHECK (is_super_admin() OR email = current_user_email());

DROP POLICY IF EXISTS staff_engagements_restrict_admin ON public.staff_engagements;
CREATE POLICY staff_engagements_restrict_admin
ON public.staff_engagements AS RESTRICTIVE FOR ALL TO authenticated
USING (is_vivacity_admin_role() OR linked_unicorn_user_id = (SELECT auth.uid()))
WITH CHECK (is_vivacity_admin_role());

DROP POLICY IF EXISTS engagement_exit_interviews_restrict_admin ON public.engagement_exit_interviews;
CREATE POLICY engagement_exit_interviews_restrict_admin
ON public.engagement_exit_interviews AS RESTRICTIVE FOR ALL TO authenticated
USING (
  is_vivacity_admin_role()
  OR EXISTS (SELECT 1 FROM public.staff_engagements se WHERE se.id = engagement_exit_interviews.engagement_id AND se.linked_unicorn_user_id = (SELECT auth.uid()) AND se.type = 'offboarding')
)
WITH CHECK (
  is_vivacity_admin_role()
  OR EXISTS (SELECT 1 FROM public.staff_engagements se WHERE se.id = engagement_exit_interviews.engagement_id AND se.linked_unicorn_user_id = (SELECT auth.uid()) AND se.type = 'offboarding')
);

DROP POLICY IF EXISTS tenant_users_restrict_scoped ON public.tenant_users;
CREATE POLICY tenant_users_restrict_scoped
ON public.tenant_users AS RESTRICTIVE FOR ALL TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR is_tenant_parent_safe(tenant_id, (SELECT auth.uid()))
  OR is_super_admin_safe((SELECT auth.uid()))
  OR is_vivacity_staff((SELECT auth.uid()))
)
WITH CHECK (
  is_tenant_parent_safe(tenant_id, (SELECT auth.uid()))
  OR is_super_admin_safe((SELECT auth.uid()))
);
COMMIT;
NOTIFY pgrst, 'reload schema';