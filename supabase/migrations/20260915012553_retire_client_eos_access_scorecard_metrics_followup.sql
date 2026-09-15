-- Follow-up to 20260915004558_retire_client_eos_access (Carl, 2026-09-15).
--
-- eos_scorecard_metrics was missed in the original pass: it has its own
-- EXISTS-based client-tenant clause (tenant_id = get_current_user_tenant()
-- AND get_current_user_role() = 'Admin' on the parent eos_scorecard row),
-- independent of has_any_eos_role/can_facilitate_eos, so the earlier
-- function patch did not close it. Same fix as eos_scorecard itself.

DROP POLICY IF EXISTS eos_scorecard_metrics_delete ON public.eos_scorecard_metrics;
CREATE POLICY eos_scorecard_metrics_delete ON public.eos_scorecard_metrics
  FOR DELETE TO authenticated
  USING (
    is_super_admin()
    OR is_vivacity_team_user((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS eos_scorecard_metrics_insert ON public.eos_scorecard_metrics;
CREATE POLICY eos_scorecard_metrics_insert ON public.eos_scorecard_metrics
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (is_vivacity_team_user((SELECT auth.uid())) AND (workspace_id IS NULL OR workspace_id = get_vivacity_workspace_id()))
  );

DROP POLICY IF EXISTS eos_scorecard_metrics_select ON public.eos_scorecard_metrics;
CREATE POLICY eos_scorecard_metrics_select ON public.eos_scorecard_metrics
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR is_vivacity_team_user((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS eos_scorecard_metrics_update ON public.eos_scorecard_metrics;
CREATE POLICY eos_scorecard_metrics_update ON public.eos_scorecard_metrics
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR is_vivacity_team_user((SELECT auth.uid()))
  )
  WITH CHECK (
    is_super_admin()
    OR is_vivacity_team_user((SELECT auth.uid()))
  );
