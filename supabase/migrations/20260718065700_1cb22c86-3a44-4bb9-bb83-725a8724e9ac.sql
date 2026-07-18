-- Defense-in-depth: RESTRICTIVE policies on user_roles and role_permissions so
-- authenticated INSERT/UPDATE/DELETE always require is_super_admin_safe, even if a
-- future PERMISSIVE policy is added that would otherwise broaden write access.
-- Existing PERMISSIVE super-admin write policies remain; RESTRICTIVE policies AND
-- with them (and with any future permissive grants).

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
