BEGIN;

CREATE OR REPLACE FUNCTION public.user_staff_safe_fields_only_changed(p_new_row public.users)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.user_uuid = p_new_row.user_uuid
      AND (to_jsonb(u) - 'is_csc' - 'disabled' - 'job_title' - 'phone' - 'updated_at' - 'full_name')
        = (to_jsonb(p_new_row) - 'is_csc' - 'disabled' - 'job_title' - 'phone' - 'updated_at' - 'full_name')
  );
$$;

REVOKE ALL ON FUNCTION public.user_staff_safe_fields_only_changed(public.users) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_staff_safe_fields_only_changed(public.users) TO authenticated;

DROP POLICY IF EXISTS "users_staff_edit_scope_restrict" ON public.users;
CREATE POLICY "users_staff_edit_scope_restrict"
ON public.users
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
  user_uuid = (SELECT auth.uid())
  OR is_super_admin_safe((SELECT auth.uid()))
  OR check_permission((SELECT auth.uid()), 'admin.team_users.manage', 'full')
  OR user_staff_safe_fields_only_changed(users)
);

NOTIFY pgrst, 'reload schema';

COMMIT;