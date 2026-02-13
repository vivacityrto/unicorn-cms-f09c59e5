
-- ============================================================
-- predictive_operational_risk_snapshots
-- ============================================================
CREATE TABLE public.predictive_operational_risk_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  package_instance_id bigint NOT NULL,
  -- Signal flags
  activity_decay boolean NOT NULL DEFAULT false,
  severe_activity_decay boolean NOT NULL DEFAULT false,
  risk_escalation boolean NOT NULL DEFAULT false,
  backlog_growth boolean NOT NULL DEFAULT false,
  sustained_backlog_growth boolean NOT NULL DEFAULT false,
  burn_rate_risk boolean NOT NULL DEFAULT false,
  phase_drift boolean NOT NULL DEFAULT false,
  -- Score
  operational_risk_score int NOT NULL DEFAULT 0,
  risk_band text NOT NULL DEFAULT 'stable' CHECK (risk_band IN ('stable', 'watch', 'at_risk', 'immediate_attention')),
  -- Raw inputs for audit
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pred_risk_tenant_pkg ON public.predictive_operational_risk_snapshots(tenant_id, package_instance_id, calculated_at DESC);
CREATE INDEX idx_pred_risk_band ON public.predictive_operational_risk_snapshots(risk_band) WHERE risk_band != 'stable';

ALTER TABLE public.predictive_operational_risk_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view predictive risk"
  ON public.predictive_operational_risk_snapshots FOR SELECT
  USING (public.has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "System can insert predictive risk"
  ON public.predictive_operational_risk_snapshots FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL OR true);

-- ============================================================
-- v_predictive_signal_inputs: raw data for signal computation
-- ============================================================
CREATE OR REPLACE VIEW public.v_predictive_signal_inputs
WITH (security_invoker = true)
AS
WITH activity_7d AS (
  SELECT
    te.tenant_id::bigint AS tenant_id,
    te.package_id::bigint AS package_id,
    COUNT(*) AS activity_count_7d
  FROM time_entries te
  WHERE te.start_at >= now() - interval '7 days'
  GROUP BY te.tenant_id, te.package_id
),
activity_30d AS (
  SELECT
    te.tenant_id::bigint AS tenant_id,
    te.package_id::bigint AS package_id,
    COUNT(*) AS activity_count_30d
  FROM time_entries te
  WHERE te.start_at >= now() - interval '30 days'
  GROUP BY te.tenant_id, te.package_id
),
-- Stage state changes as activity proxy
stage_activity_7d AS (
  SELECT
    cpss.tenant_id,
    cpss.package_id,
    COUNT(*) AS stage_updates_7d
  FROM client_package_stage_state cpss
  WHERE cpss.updated_at >= now() - interval '7 days'
  GROUP BY cpss.tenant_id, cpss.package_id
),
stage_activity_30d AS (
  SELECT
    cpss.tenant_id,
    cpss.package_id,
    COUNT(*) AS stage_updates_30d
  FROM client_package_stage_state cpss
  WHERE cpss.updated_at >= now() - interval '30 days'
  GROUP BY cpss.tenant_id, cpss.package_id
),
-- Risk signals
new_high_risks_7d AS (
  SELECT
    ei.tenant_id,
    COUNT(*) AS new_high_count
  FROM eos_issues ei
  WHERE ei.deleted_at IS NULL
    AND ei.created_at >= now() - interval '7 days'
    AND ei.impact IN ('Critical', 'critical', 'High', 'high')
  GROUP BY ei.tenant_id
),
overdue_high_risks AS (
  SELECT
    ei.tenant_id,
    COUNT(*) AS overdue_count
  FROM eos_issues ei
  WHERE ei.deleted_at IS NULL
    AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
    AND ei.resolved_at IS NULL
    AND ei.impact IN ('High', 'high')
    AND ei.created_at < now() - interval '14 days'
  GROUP BY ei.tenant_id
),
-- Docs missing now
docs_missing_now AS (
  SELECT
    d.tenant_id,
    d.package_id,
    COUNT(*) FILTER (
      WHERE d.uploaded_files IS NULL
        OR array_length(d.uploaded_files, 1) IS NULL
        OR array_length(d.uploaded_files, 1) = 0
    ) AS missing_docs_count
  FROM documents d
  GROUP BY d.tenant_id, d.package_id
),
-- Burn rate: hours used last 30d from time_entries
burn_30d AS (
  SELECT
    te.tenant_id::bigint AS tenant_id,
    te.package_id::bigint AS package_id,
    COALESCE(SUM(te.duration_minutes), 0) / 60.0 AS hours_used_30d
  FROM time_entries te
  WHERE te.start_at >= now() - interval '30 days'
  GROUP BY te.tenant_id, te.package_id
),
-- Current phase progress
current_phase AS (
  SELECT DISTINCT ON (cpss.tenant_id, cpss.package_id)
    cpss.tenant_id,
    cpss.package_id,
    cpss.stage_id,
    EXTRACT(DAY FROM now() - COALESCE(cpss.started_at, cpss.created_at))::int AS days_in_phase
  FROM client_package_stage_state cpss
  WHERE cpss.is_required = true AND cpss.status != 'complete'
  ORDER BY cpss.tenant_id, cpss.package_id, cpss.sort_order
),
-- Actions remaining from v_phase_actions_remaining
actions_remaining AS (
  SELECT tenant_id, package_instance_id, package_id, total_actions_remaining
  FROM v_phase_actions_remaining
)
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  pi.package_id,
  t.name AS client_name,
  p.name AS package_name,
  pi.manager_id,
  -- Activity trend
  COALESCE(a7.activity_count_7d, 0) + COALESCE(sa7.stage_updates_7d, 0) AS total_activity_7d,
  COALESCE(a30.activity_count_30d, 0) + COALESCE(sa30.stage_updates_30d, 0) AS total_activity_30d,
  CASE
    WHEN COALESCE(a30.activity_count_30d, 0) + COALESCE(sa30.stage_updates_30d, 0) = 0 THEN 0
    ELSE ROUND(
      (COALESCE(a7.activity_count_7d, 0) + COALESCE(sa7.stage_updates_7d, 0))::numeric
      / GREATEST((COALESCE(a30.activity_count_30d, 0) + COALESCE(sa30.stage_updates_30d, 0))::numeric / 4.0, 1)
    , 2)
  END AS activity_trend_ratio,
  -- Risk signals
  COALESCE(nhr.new_high_count, 0) AS new_high_risks_7d,
  COALESCE(ohr.overdue_count, 0) AS overdue_high_risks,
  -- Docs
  COALESCE(dm.missing_docs_count, 0) AS missing_docs_now,
  -- Burn rate
  COALESCE(b30.hours_used_30d, 0) AS hours_used_30d,
  COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0) - COALESCE(pi.hours_used, 0) AS remaining_hours,
  CASE
    WHEN COALESCE(b30.hours_used_30d, 0) > 0
    THEN ROUND((COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0) - COALESCE(pi.hours_used, 0))::numeric / (COALESCE(b30.hours_used_30d, 0) / 30.0), 0)
    ELSE 9999
  END AS projected_days_to_exhaustion,
  -- Phase drift
  COALESCE(cp.days_in_phase, 0) AS days_in_current_phase,
  COALESCE(ar.total_actions_remaining, 0) AS actions_remaining
FROM package_instances pi
JOIN tenants t ON t.id = pi.tenant_id
JOIN packages p ON p.id = pi.package_id
LEFT JOIN activity_7d a7 ON a7.tenant_id = pi.tenant_id AND a7.package_id = pi.package_id
LEFT JOIN activity_30d a30 ON a30.tenant_id = pi.tenant_id AND a30.package_id = pi.package_id
LEFT JOIN stage_activity_7d sa7 ON sa7.tenant_id = pi.tenant_id AND sa7.package_id = pi.package_id
LEFT JOIN stage_activity_30d sa30 ON sa30.tenant_id = pi.tenant_id AND sa30.package_id = pi.package_id
LEFT JOIN new_high_risks_7d nhr ON nhr.tenant_id = pi.tenant_id
LEFT JOIN overdue_high_risks ohr ON ohr.tenant_id = pi.tenant_id
LEFT JOIN docs_missing_now dm ON dm.tenant_id = pi.tenant_id AND dm.package_id = pi.package_id
LEFT JOIN burn_30d b30 ON b30.tenant_id = pi.tenant_id AND b30.package_id = pi.package_id
LEFT JOIN current_phase cp ON cp.tenant_id = pi.tenant_id AND cp.package_id = pi.package_id
LEFT JOIN actions_remaining ar ON ar.tenant_id = pi.tenant_id AND ar.package_id = pi.package_id
WHERE pi.is_complete = false;
