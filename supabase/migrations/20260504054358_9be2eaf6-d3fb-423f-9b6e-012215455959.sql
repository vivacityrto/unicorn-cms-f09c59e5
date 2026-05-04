DROP POLICY IF EXISTS "package_instance_state_log_superadmin_delete" ON public.package_instance_state_log;
CREATE POLICY "package_instance_state_log_superadmin_delete"
ON public.package_instance_state_log
FOR DELETE
TO authenticated
USING (is_super_admin_safe(auth.uid()));