-- Fix eos_scorecard RLS: Allow Vivacity staff (not just Super Admin) to manage scorecards
DROP POLICY IF EXISTS "Admins can manage scorecards" ON public.eos_scorecard;
CREATE POLICY "Admins can manage scorecards" ON public.eos_scorecard
FOR ALL TO authenticated
USING (is_super_admin() OR is_vivacity_team_safe(auth.uid()) OR (tenant_id = get_current_user_tenant() AND get_current_user_role() = 'Admin'))
WITH CHECK (is_super_admin() OR is_vivacity_team_safe(auth.uid()) OR (tenant_id = get_current_user_tenant() AND get_current_user_role() = 'Admin'));