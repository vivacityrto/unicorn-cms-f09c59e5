-- Fix: Allow Vivacity team users to read QC templates
-- Currently only allows tenant_id match or super admin, blocking team members with null tenant_id

DROP POLICY IF EXISTS "qc_templates_select" ON public.eos_qc_templates;

CREATE POLICY "qc_templates_select" ON public.eos_qc_templates
FOR SELECT TO authenticated
USING (
  tenant_id = get_current_user_tenant()
  OR is_super_admin()
  OR is_vivacity_team_user(auth.uid())
);