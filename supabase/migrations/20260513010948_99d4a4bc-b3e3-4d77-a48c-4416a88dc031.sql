BEGIN;

-- eos_accountability_chart: 2 SELECT → 1
DROP POLICY IF EXISTS "eos_accountability_chart_users_select"
  ON public.eos_accountability_chart;
DROP POLICY IF EXISTS "eos_accountability_select"
  ON public.eos_accountability_chart;
CREATE POLICY "eos_accountability_chart_select"
  ON public.eos_accountability_chart FOR SELECT
  USING (
    has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR is_super_admin()
    OR (tenant_id = get_current_user_tenant())
  );

-- eos_agenda_templates: 2 SELECT → 1
DROP POLICY IF EXISTS "eos_agenda_templates_select"
  ON public.eos_agenda_templates;
DROP POLICY IF EXISTS "eos_agenda_templates_users_select"
  ON public.eos_agenda_templates;
CREATE POLICY "eos_agenda_templates_select"
  ON public.eos_agenda_templates FOR SELECT
  USING (
    has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR is_super_admin()
    OR (tenant_id = get_current_user_tenant())
  );

-- eos_scorecard_entries: 2 SELECT → 1
DROP POLICY IF EXISTS "eos_scorecard_entries_users_select"
  ON public.eos_scorecard_entries;
DROP POLICY IF EXISTS "eos_scorecard_entries_vivacity_select"
  ON public.eos_scorecard_entries;
CREATE POLICY "eos_scorecard_entries_select"
  ON public.eos_scorecard_entries FOR SELECT
  USING (
    is_vivacity_team_user((SELECT auth.uid()))
    OR has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR is_super_admin()
  );

-- eos_scorecard_metrics: 3 SELECT → 1
DROP POLICY IF EXISTS "eos_scorecard_metrics_tenant_select"
  ON public.eos_scorecard_metrics;
DROP POLICY IF EXISTS "eos_scorecard_metrics_users_select"
  ON public.eos_scorecard_metrics;
DROP POLICY IF EXISTS "eos_scorecard_metrics_vivacity_select"
  ON public.eos_scorecard_metrics;
CREATE POLICY "eos_scorecard_metrics_select"
  ON public.eos_scorecard_metrics FOR SELECT
  USING (
    is_vivacity_team_user((SELECT auth.uid()))
    OR is_super_admin()
    OR has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.eos_scorecard sc
      WHERE sc.id = eos_scorecard_metrics.scorecard_id
        AND sc.tenant_id = get_current_user_tenant()
    )
  );

-- eos_todos: 3 SELECT → 1
DROP POLICY IF EXISTS "eos_todos_select"
  ON public.eos_todos;
DROP POLICY IF EXISTS "eos_todos_users_select"
  ON public.eos_todos;
DROP POLICY IF EXISTS "eos_todos_vivacity_select"
  ON public.eos_todos;
CREATE POLICY "eos_todos_select"
  ON public.eos_todos FOR SELECT
  USING (
    is_vivacity_team_user((SELECT auth.uid()))
    OR is_super_admin()
    OR has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR (tenant_id = get_current_user_tenant())
    OR (assigned_to = (SELECT auth.uid()))
  );

-- eos_meeting_series: 2 SELECT → 1
DROP POLICY IF EXISTS "eos_meeting_series_tenant_select"
  ON public.eos_meeting_series;
DROP POLICY IF EXISTS "eos_meeting_series_vivacity_select"
  ON public.eos_meeting_series;
CREATE POLICY "eos_meeting_series_select"
  ON public.eos_meeting_series FOR SELECT
  USING (
    is_vivacity_team_user((SELECT auth.uid()))
    OR (tenant_id IN (
      SELECT users.tenant_id FROM public.users
      WHERE users.user_uuid = (SELECT auth.uid())
    ))
  );

-- eos_alerts: 2 SELECT → 1
DROP POLICY IF EXISTS "eos_alerts_staff_select"
  ON public.eos_alerts;
DROP POLICY IF EXISTS "eos_alerts_tenant_select"
  ON public.eos_alerts;
CREATE POLICY "eos_alerts_select"
  ON public.eos_alerts FOR SELECT
  USING (
    is_vivacity_team_user((SELECT auth.uid()))
    OR (tenant_id IN (
      SELECT users.tenant_id FROM public.users
      WHERE users.user_uuid = (SELECT auth.uid())
    ))
  );

-- eos_health_snapshots: 2 SELECT → 1
DROP POLICY IF EXISTS "eos_health_snapshots_staff_select"
  ON public.eos_health_snapshots;
DROP POLICY IF EXISTS "eos_health_snapshots_tenant_select"
  ON public.eos_health_snapshots;
CREATE POLICY "eos_health_snapshots_select"
  ON public.eos_health_snapshots FOR SELECT
  USING (
    is_vivacity_team_user((SELECT auth.uid()))
    OR (tenant_id IN (
      SELECT users.tenant_id FROM public.users
      WHERE users.user_uuid = (SELECT auth.uid())
    ))
  );

-- eos_user_roles: 2 SELECT → 1
DROP POLICY IF EXISTS "eos_user_roles_superadmin_select"
  ON public.eos_user_roles;
DROP POLICY IF EXISTS "eos_user_roles_users_select_own"
  ON public.eos_user_roles;
CREATE POLICY "eos_user_roles_select"
  ON public.eos_user_roles FOR SELECT
  USING (
    (user_id = (SELECT auth.uid()))
    OR is_super_admin()
  );

COMMIT;

-- Verification: confirm exactly 1 SELECT policy per table
-- Expected: 9 rows, each with select_policy_count = 1
--
-- SELECT tablename, COUNT(*) AS select_policy_count
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'eos_accountability_chart','eos_agenda_templates',
--     'eos_scorecard_entries','eos_scorecard_metrics','eos_todos',
--     'eos_meeting_series','eos_alerts','eos_health_snapshots','eos_user_roles'
--   )
--   AND cmd = 'SELECT'
-- GROUP BY tablename
-- ORDER BY tablename;
