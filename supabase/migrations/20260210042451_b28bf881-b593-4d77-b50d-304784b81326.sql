-- Fix: Allow all Vivacity internal staff to read CSC assignments (not just Super Admins)
DROP POLICY IF EXISTS "tenant_csc_read_own_tenant" ON public.tenant_csc_assignments;

CREATE POLICY "tenant_csc_read_own_tenant"
ON public.tenant_csc_assignments
FOR SELECT
USING (
  is_super_admin_safe(auth.uid())
  OR is_vivacity_team_safe(auth.uid())
  OR is_tenant_member(tenant_id)
);