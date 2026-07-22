BEGIN;
DROP POLICY IF EXISTS user_roles_restrict_writes_superadmin ON public.user_roles;
CREATE POLICY user_roles_restrict_writes_superadmin
ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS user_roles_restrict_update_superadmin ON public.user_roles;
CREATE POLICY user_roles_restrict_update_superadmin
ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated
USING (is_super_admin_safe((SELECT auth.uid())))
WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS user_roles_restrict_delete_superadmin ON public.user_roles;
CREATE POLICY user_roles_restrict_delete_superadmin
ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated
USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS role_permissions_restrict_writes_superadmin ON public.role_permissions;
CREATE POLICY role_permissions_restrict_writes_superadmin
ON public.role_permissions AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS role_permissions_restrict_update_superadmin ON public.role_permissions;
CREATE POLICY role_permissions_restrict_update_superadmin
ON public.role_permissions AS RESTRICTIVE FOR UPDATE TO authenticated
USING (is_super_admin_safe((SELECT auth.uid())))
WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS role_permissions_restrict_delete_superadmin ON public.role_permissions;
CREATE POLICY role_permissions_restrict_delete_superadmin
ON public.role_permissions AS RESTRICTIVE FOR DELETE TO authenticated
USING (is_super_admin_safe((SELECT auth.uid())));
COMMIT;
NOTIFY pgrst, 'reload schema';
-- sync-nudge 2026-07-22b
