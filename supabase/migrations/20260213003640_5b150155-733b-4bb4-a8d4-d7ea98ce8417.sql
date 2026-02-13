
-- ============================================================
-- momentum_state_history: audit trail for momentum state changes
-- ============================================================
CREATE TABLE public.momentum_state_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  package_instance_id bigint NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'paused', 'at_risk', 'recovered')),
  pause_reason text[] NOT NULL DEFAULT '{}',
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by_system boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_momentum_history_tenant ON public.momentum_state_history (tenant_id, package_instance_id, changed_at DESC);

ALTER TABLE public.momentum_state_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view momentum history"
  ON public.momentum_state_history FOR SELECT
  USING (public.has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "Vivacity staff can insert momentum history"
  ON public.momentum_state_history FOR INSERT
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- ============================================================
-- v_momentum_state: unified momentum state per package instance
-- ============================================================
CREATE OR REPLACE VIEW public.v_momentum_state
WITH (security_invoker = true)
AS
WITH last_activity AS (
  SELECT
    cpss.tenant_id,
    cpss.package_id,
    MAX(GREATEST(
      COALESCE(cpss.updated_at, '1970-01-01'::timestamptz),
      COALESCE(cpss.completed_at, '1970-01-01'::timestamptz)
    )) AS last_activity_at
  FROM client_package_stage_state cpss
  GROUP BY cpss.tenant_id, cpss.package_id
),
current_phase AS (
  SELECT
    cpss.tenant_id,
    cpss.package_id,
    cpss.stage_id,
    cpss.started_at,
    cpss.updated_at AS phase_last_updated,
    ds.title AS phase_name,
    EXTRACT(DAY FROM now() - COALESCE(cpss.started_at, cpss.created_at))::int AS days_in_phase
  FROM client_package_stage_state cpss
  JOIN documents_stages ds ON ds.id = cpss.stage_id
  WHERE cpss.is_required = true AND cpss.status != 'complete'
  AND cpss.sort_order = (
    SELECT MIN(cpss2.sort_order)
    FROM client_package_stage_state cpss2
    WHERE cpss2.tenant_id = cpss.tenant_id
      AND cpss2.package_id = cpss.package_id
      AND cpss2.is_required = true
      AND cpss2.status != 'complete'
  )
),
recent_completion AS (
  SELECT
    cpss.tenant_id,
    cpss.package_id,
    MAX(cpss.completed_at) AS last_completed_at
  FROM client_package_stage_state cpss
  WHERE cpss.status = 'complete' AND cpss.completed_at IS NOT NULL
  GROUP BY cpss.tenant_id, cpss.package_id
)
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  pi.package_id,
  t.name AS client_name,
  p.name AS package_name,
  pi.manager_id,
  -- Days since last activity
  COALESCE(EXTRACT(DAY FROM now() - la.last_activity_at)::int, 999) AS days_since_last_activity,
  -- Days in current phase
  COALESCE(cp.days_in_phase, 0) AS days_in_current_phase,
  cp.phase_name AS current_phase_name,
  -- Risk flags
  EXISTS (
    SELECT 1 FROM eos_issues ei
    WHERE ei.tenant_id = pi.tenant_id
      AND ei.deleted_at IS NULL
      AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
      AND ei.resolved_at IS NULL
  ) AS has_unresolved_risk,
  EXISTS (
    SELECT 1 FROM eos_issues ei
    WHERE ei.tenant_id = pi.tenant_id
      AND ei.deleted_at IS NULL
      AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
      AND ei.resolved_at IS NULL
      AND (ei.impact = 'Critical' OR ei.impact = 'critical')
  ) AS has_active_critical,
  -- Pause reasons array
  ARRAY_REMOVE(ARRAY[
    CASE
      WHEN COALESCE(EXTRACT(DAY FROM now() - la.last_activity_at)::int, 999) > 14
        AND (rc.last_completed_at IS NULL OR rc.last_completed_at < now() - interval '7 days')
      THEN 'stale_data'
    END,
    CASE
      WHEN cp.days_in_phase > 14
      THEN 'phase_stalled'
    END,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM eos_issues ei
        WHERE ei.tenant_id = pi.tenant_id
          AND ei.deleted_at IS NULL
          AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
          AND ei.resolved_at IS NULL
          AND (ei.impact IN ('Critical', 'critical', 'High', 'high'))
      )
      THEN 'risk_unresolved'
    END
  ], NULL) AS pause_reason,
  -- Is paused
  (
    (COALESCE(EXTRACT(DAY FROM now() - la.last_activity_at)::int, 999) > 14
      AND (rc.last_completed_at IS NULL OR rc.last_completed_at < now() - interval '7 days'))
    OR cp.days_in_phase > 14
    OR EXISTS (
      SELECT 1 FROM eos_issues ei
      WHERE ei.tenant_id = pi.tenant_id
        AND ei.deleted_at IS NULL
        AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
        AND ei.resolved_at IS NULL
        AND (ei.impact IN ('Critical', 'critical', 'High', 'high'))
    )
  ) AS is_paused,
  -- Momentum state
  CASE
    WHEN EXISTS (
      SELECT 1 FROM eos_issues ei
      WHERE ei.tenant_id = pi.tenant_id
        AND ei.deleted_at IS NULL
        AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
        AND ei.resolved_at IS NULL
        AND (ei.impact = 'Critical' OR ei.impact = 'critical')
    ) THEN 'at_risk'
    WHEN (
      (COALESCE(EXTRACT(DAY FROM now() - la.last_activity_at)::int, 999) > 14
        AND (rc.last_completed_at IS NULL OR rc.last_completed_at < now() - interval '7 days'))
      OR cp.days_in_phase > 14
      OR EXISTS (
        SELECT 1 FROM eos_issues ei
        WHERE ei.tenant_id = pi.tenant_id
          AND ei.deleted_at IS NULL
          AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
          AND ei.resolved_at IS NULL
          AND ei.impact IN ('High', 'high')
      )
    ) THEN 'paused'
    -- Check if recently recovered (within 24h)
    WHEN EXISTS (
      SELECT 1 FROM momentum_state_history msh
      WHERE msh.tenant_id = pi.tenant_id
        AND msh.package_instance_id = pi.id
        AND msh.state = 'recovered'
        AND msh.changed_at > now() - interval '24 hours'
    ) THEN 'recovered'
    ELSE 'active'
  END AS momentum_state,
  -- Recovery eligible: was paused, now all clear
  (
    EXISTS (
      SELECT 1 FROM momentum_state_history msh
      WHERE msh.tenant_id = pi.tenant_id
        AND msh.package_instance_id = pi.id
        AND msh.state IN ('paused', 'at_risk')
        AND msh.changed_at > now() - interval '30 days'
    )
    AND NOT (
      (COALESCE(EXTRACT(DAY FROM now() - la.last_activity_at)::int, 999) > 14
        AND (rc.last_completed_at IS NULL OR rc.last_completed_at < now() - interval '7 days'))
      OR cp.days_in_phase > 14
      OR EXISTS (
        SELECT 1 FROM eos_issues ei
        WHERE ei.tenant_id = pi.tenant_id
          AND ei.deleted_at IS NULL
          AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
          AND ei.resolved_at IS NULL
          AND (ei.impact IN ('Critical', 'critical', 'High', 'high'))
      )
    )
  ) AS recovery_eligible
FROM package_instances pi
JOIN tenants t ON t.id = pi.tenant_id
JOIN packages p ON p.id = pi.package_id
LEFT JOIN last_activity la ON la.tenant_id = pi.tenant_id AND la.package_id = pi.package_id
LEFT JOIN current_phase cp ON cp.tenant_id = pi.tenant_id AND cp.package_id = pi.package_id
LEFT JOIN recent_completion rc ON rc.tenant_id = pi.tenant_id AND rc.package_id = pi.package_id
WHERE pi.is_complete = false;
