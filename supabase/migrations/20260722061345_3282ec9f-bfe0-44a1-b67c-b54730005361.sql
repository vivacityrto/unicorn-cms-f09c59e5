-- Reconcile C2: block privilege escalation via direct REST on public.users
-- Already applied live 12-13 Jul; this file gives it a git + schema_migrations record.
DROP POLICY IF EXISTS users_no_privilege_escalation ON public.users;
CREATE POLICY users_no_privilege_escalation
ON public.users AS RESTRICTIVE FOR UPDATE TO authenticated
USING (true)
WITH CHECK (
  is_super_admin_safe((SELECT auth.uid()))
  OR user_protected_fields_unchanged_safe(
       user_uuid, unicorn_role, is_vivacity_internal, global_role, superadmin_level, tenant_id
     )
);
NOTIFY pgrst, 'reload schema';