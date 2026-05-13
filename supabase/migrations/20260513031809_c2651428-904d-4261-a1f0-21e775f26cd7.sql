-- P1-b Batch 05: financial_ tables (4 policies, 1 table)

-- financial_controls
DROP POLICY IF EXISTS financial_controls_delete_superadmin ON public.financial_controls;
CREATE POLICY financial_controls_delete_superadmin ON public.financial_controls AS PERMISSIVE FOR DELETE TO public USING (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS financial_controls_insert_superadmin ON public.financial_controls;
CREATE POLICY financial_controls_insert_superadmin ON public.financial_controls AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS financial_controls_select_vivacity ON public.financial_controls;
CREATE POLICY financial_controls_select_vivacity ON public.financial_controls AS PERMISSIVE FOR SELECT TO public USING (is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS financial_controls_update_superadmin ON public.financial_controls;
CREATE POLICY financial_controls_update_superadmin ON public.financial_controls AS PERMISSIVE FOR UPDATE TO public USING (is_super_admin_safe((SELECT auth.uid())));