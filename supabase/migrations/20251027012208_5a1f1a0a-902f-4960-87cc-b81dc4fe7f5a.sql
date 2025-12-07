-- Update tenants SELECT policy to include Team Leaders
DROP POLICY IF EXISTS "tenants_read" ON public.tenants;

CREATE POLICY "tenants_read" ON public.tenants
FOR SELECT USING (
  public.is_vivacity()
  OR public.is_superadmin()
  OR get_current_user_role() = 'Team Leader'
);