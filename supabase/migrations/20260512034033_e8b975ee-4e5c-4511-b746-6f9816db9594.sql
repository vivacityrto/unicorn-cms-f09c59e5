DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (user_uuid = auth.uid())
  WITH CHECK (
    (user_uuid = auth.uid())
    AND user_protected_fields_unchanged_safe(
      auth.uid(),
      unicorn_role,
      is_vivacity_internal,
      global_role,
      superadmin_level,
      tenant_id
    )
  );