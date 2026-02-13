
-- ============================================================
-- user_win_banner_state: tracks weekly win banner triggers per user
-- ============================================================
CREATE TABLE public.user_win_banner_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid uuid NOT NULL REFERENCES public.users(user_uuid),
  week_start_date date NOT NULL,
  milestone_3_triggered boolean NOT NULL DEFAULT false,
  hours_100_triggered boolean NOT NULL DEFAULT false,
  rocks_5_triggered boolean NOT NULL DEFAULT false,
  dismissed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_uuid, week_start_date)
);

ALTER TABLE public.user_win_banner_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own win banner state"
  ON public.user_win_banner_state FOR SELECT
  USING (auth.uid() = user_uuid);

CREATE POLICY "Users can insert own win banner state"
  ON public.user_win_banner_state FOR INSERT
  WITH CHECK (auth.uid() = user_uuid);

CREATE POLICY "Users can update own win banner state"
  ON public.user_win_banner_state FOR UPDATE
  USING (auth.uid() = user_uuid);

-- ============================================================
-- v_dashboard_consultant_momentum
-- Ranked client list for consultant's momentum panel
-- ============================================================
CREATE OR REPLACE VIEW public.v_dashboard_consultant_momentum
WITH (security_invoker = true)
AS
SELECT
  pi.manager_id AS user_uuid,
  pi.tenant_id,
  t.name AS client_name,
  pi.id AS package_instance_id,
  pi.package_id,
  p.name AS package_name,
  COALESCE(cs.overall_score, 0) AS overall_score,
  COALESCE(cs.phase_completion, 0) AS phase_completion,
  COALESCE(cs.risk_health, 100) AS risk_health,
  COALESCE(cs.consult_health, 100) AS consult_health,
  COALESCE(cs.days_stale, 0) AS days_stale,
  COALESCE(cs.is_stale, false) AS is_stale,
  COALESCE(cs.caps_applied, '[]'::jsonb) AS caps_applied,
  -- Hours remaining
  GREATEST(0, (COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0)) - COALESCE(pi.hours_used, 0))::numeric AS hours_remaining,
  -- Risk state
  CASE
    WHEN EXISTS (
      SELECT 1 FROM eos_issues ei
      WHERE ei.tenant_id = pi.tenant_id
        AND ei.deleted_at IS NULL
        AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
        AND ei.resolved_at IS NULL
        AND (ei.impact = 'Critical' OR ei.impact = 'critical')
    ) THEN 'critical'
    WHEN EXISTS (
      SELECT 1 FROM eos_issues ei
      WHERE ei.tenant_id = pi.tenant_id
        AND ei.deleted_at IS NULL
        AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
        AND ei.resolved_at IS NULL
    ) THEN 'at_risk'
    ELSE 'on_track'
  END AS risk_state,
  cs.calculated_at AS score_calculated_at
FROM package_instances pi
JOIN tenants t ON t.id = pi.tenant_id
JOIN packages p ON p.id = pi.package_id
LEFT JOIN v_compliance_score_latest cs ON cs.tenant_id = pi.tenant_id AND cs.package_instance_id = pi.id
WHERE pi.is_complete = false
  AND pi.manager_id IS NOT NULL
ORDER BY
  -- Critical risk to top
  CASE WHEN EXISTS (
    SELECT 1 FROM eos_issues ei
    WHERE ei.tenant_id = pi.tenant_id
      AND ei.deleted_at IS NULL
      AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
      AND ei.resolved_at IS NULL
      AND (ei.impact = 'Critical' OR ei.impact = 'critical')
  ) THEN 0 ELSE 1 END,
  COALESCE(cs.overall_score, 0) DESC,
  COALESCE(cs.phase_completion, 0) DESC,
  GREATEST(0, (COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0)) - COALESCE(pi.hours_used, 0)) ASC;

-- ============================================================
-- v_dashboard_weekly_wins
-- Aggregates wins for the current week (Mon-Sun) per user
-- ============================================================
CREATE OR REPLACE VIEW public.v_dashboard_weekly_wins
WITH (security_invoker = true)
AS
WITH week_bounds AS (
  SELECT
    date_trunc('week', now() AT TIME ZONE 'Australia/Sydney')::timestamptz AS week_start,
    (date_trunc('week', now() AT TIME ZONE 'Australia/Sydney') + interval '7 days')::timestamptz AS week_end
)
SELECT
  u.user_uuid,
  wb.week_start::date AS week_start_date,
  -- Rocks closed this week
  COALESCE((
    SELECT COUNT(*) FROM eos_rocks r
    WHERE r.owner_id = u.user_uuid
      AND r.status = 'Complete'
      AND r.completed_date >= wb.week_start::date
      AND r.completed_date < wb.week_end::date
  ), 0)::int AS rocks_closed,
  -- Phases completed this week
  COALESCE((
    SELECT COUNT(*) FROM client_package_stage_state cpss
    JOIN package_instances pi ON pi.package_id = cpss.package_id AND pi.tenant_id = cpss.tenant_id
    WHERE pi.manager_id = u.user_uuid
      AND cpss.status = 'complete'
      AND cpss.completed_at >= wb.week_start
      AND cpss.completed_at < wb.week_end
  ), 0)::int AS phases_completed,
  -- Documents generated this week
  COALESCE((
    SELECT COUNT(*) FROM document_instances di
    WHERE di.isgenerated = true
      AND di.created_at >= wb.week_start
      AND di.created_at < wb.week_end
      AND di.tenant_id IN (
        SELECT pi2.tenant_id FROM package_instances pi2
        WHERE pi2.manager_id = u.user_uuid AND pi2.is_complete = false
      )
  ), 0)::int AS documents_generated,
  -- Clients moved forward (any phase advanced)
  COALESCE((
    SELECT COUNT(DISTINCT cpss2.tenant_id) FROM client_package_stage_state cpss2
    JOIN package_instances pi3 ON pi3.package_id = cpss2.package_id AND pi3.tenant_id = cpss2.tenant_id
    WHERE pi3.manager_id = u.user_uuid
      AND cpss2.updated_at >= wb.week_start
      AND cpss2.updated_at < wb.week_end
      AND cpss2.status IN ('complete', 'in_progress')
  ), 0)::int AS clients_moved_forward,
  -- Hours logged this week
  COALESCE((
    SELECT ROUND(SUM(te.duration_minutes) / 60.0, 1) FROM time_entries te
    WHERE te.user_id = u.user_uuid
      AND te.created_at >= wb.week_start
      AND te.created_at < wb.week_end
  ), 0)::numeric AS hours_logged,
  -- Milestone count (celebration events this week)
  COALESCE((
    SELECT COUNT(*) FROM celebration_events ce
    WHERE ce.actor_user_uuid = u.user_uuid
      AND ce.created_at >= wb.week_start
      AND ce.created_at < wb.week_end
  ), 0)::int AS milestones_count
FROM users u
CROSS JOIN week_bounds wb
WHERE u.is_vivacity_internal = true;

-- ============================================================
-- v_client_dashboard_progress
-- Progress summary for client portal
-- ============================================================
CREATE OR REPLACE VIEW public.v_client_dashboard_progress
WITH (security_invoker = true)
AS
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  pi.package_id,
  p.name AS package_name,
  -- Current phase (first non-complete required stage)
  (
    SELECT ds.title FROM client_package_stage_state cpss
    JOIN documents_stages ds ON ds.id = cpss.stage_id
    WHERE cpss.tenant_id = pi.tenant_id AND cpss.package_id = pi.package_id
      AND cpss.is_required = true AND cpss.status != 'complete'
    ORDER BY cpss.sort_order ASC LIMIT 1
  ) AS current_phase_name,
  COALESCE(cs.phase_completion, 0) AS phase_completion,
  -- Steps remaining
  COALESCE((
    SELECT COUNT(*) FROM client_package_stage_state cpss
    WHERE cpss.tenant_id = pi.tenant_id AND cpss.package_id = pi.package_id
      AND cpss.is_required = true AND cpss.status != 'complete'
  ), 0)::int AS steps_remaining,
  COALESCE(cs.overall_score, 0) AS overall_score,
  COALESCE(cs.documentation_coverage, 0) AS documentation_coverage,
  -- Risk state (simplified for clients)
  CASE
    WHEN EXISTS (
      SELECT 1 FROM eos_issues ei
      WHERE ei.tenant_id = pi.tenant_id
        AND ei.deleted_at IS NULL
        AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
        AND ei.resolved_at IS NULL
        AND (ei.impact = 'Critical' OR ei.impact = 'critical')
    ) THEN 'action_required'
    WHEN EXISTS (
      SELECT 1 FROM eos_issues ei
      WHERE ei.tenant_id = pi.tenant_id
        AND ei.deleted_at IS NULL
        AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
        AND ei.resolved_at IS NULL
    ) THEN 'needs_attention'
    ELSE 'on_track'
  END AS risk_state,
  -- Next best action
  CASE
    WHEN cs.documentation_coverage IS NOT NULL AND cs.documentation_coverage < 80
      AND cs.inputs->>'total_required_docs' IS NOT NULL
      AND (cs.inputs->>'total_required_docs')::int > (cs.inputs->>'present_docs')::int
    THEN 'upload_docs'
    WHEN cs.phase_completion IS NOT NULL AND cs.phase_completion < 100
    THEN 'complete_tasks'
    ELSE 'review_progress'
  END AS next_best_action_type,
  CASE
    WHEN cs.documentation_coverage IS NOT NULL AND cs.documentation_coverage < 80
      AND cs.inputs->>'total_required_docs' IS NOT NULL
      AND (cs.inputs->>'total_required_docs')::int > (cs.inputs->>'present_docs')::int
    THEN 'Upload required documents'
    WHEN cs.phase_completion IS NOT NULL AND cs.phase_completion < 100
    THEN 'Complete next phase tasks'
    ELSE 'Review progress summary'
  END AS next_best_action_label,
  CASE
    WHEN cs.documentation_coverage IS NOT NULL AND cs.documentation_coverage < 80
    THEN '/client/documents'
    WHEN cs.phase_completion IS NOT NULL AND cs.phase_completion < 100
    THEN '/client/documents'
    ELSE '/client/home'
  END AS next_best_action_href,
  cs.calculated_at AS score_calculated_at
FROM package_instances pi
JOIN packages p ON p.id = pi.package_id
LEFT JOIN v_compliance_score_latest cs ON cs.tenant_id = pi.tenant_id AND cs.package_instance_id = pi.id
WHERE pi.is_complete = false;
