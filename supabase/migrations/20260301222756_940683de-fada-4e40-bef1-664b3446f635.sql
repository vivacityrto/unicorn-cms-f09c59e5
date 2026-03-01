-- Allow Vivacity staff (Super Admin + Team Leader) to update tenants for logo management
CREATE POLICY "tenants_update_staff_logo"
ON public.tenants
FOR UPDATE
TO authenticated
USING (is_vivacity_team_safe(auth.uid()))
WITH CHECK (is_vivacity_team_safe(auth.uid()));
