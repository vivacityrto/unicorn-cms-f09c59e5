
-- ============================================================
-- package_phase_requirements: defines what each phase requires
-- ============================================================
CREATE TABLE public.package_phase_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_type text NOT NULL,
  phase_key text NOT NULL,
  requirement_type text NOT NULL CHECK (requirement_type IN ('checklist', 'document', 'meeting', 'approval', 'milestone')),
  requirement_key text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  weight int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_type, phase_key, requirement_type, requirement_key)
);

CREATE INDEX idx_ppr_package_type ON public.package_phase_requirements(package_type, phase_key);

ALTER TABLE public.package_phase_requirements ENABLE ROW LEVEL SECURITY;

-- Global read for all authenticated users (lookup table)
CREATE POLICY "Authenticated users can read phase requirements"
  ON public.package_phase_requirements FOR SELECT
  TO authenticated
  USING (true);

-- Only SuperAdmins can manage
CREATE POLICY "SuperAdmins can manage phase requirements"
  ON public.package_phase_requirements FOR ALL
  USING (public.is_super_admin_safe(auth.uid()));

-- ============================================================
-- v_phase_actions_remaining: deterministic action counts
-- ============================================================
CREATE OR REPLACE VIEW public.v_phase_actions_remaining
WITH (security_invoker = true)
AS
WITH current_stage AS (
  -- Find the current (first incomplete required) stage per package instance
  SELECT DISTINCT ON (cpss.tenant_id, cpss.package_id)
    cpss.tenant_id,
    cpss.package_id,
    cpss.stage_id,
    cpss.status AS stage_status,
    cpss.sort_order,
    ds.title AS phase_name,
    ds.stage_key AS phase_key
  FROM client_package_stage_state cpss
  JOIN documents_stages ds ON ds.id = cpss.stage_id
  WHERE cpss.is_required = true
    AND cpss.status != 'complete'
  ORDER BY cpss.tenant_id, cpss.package_id, cpss.sort_order
),
-- Count incomplete checklist items per stage
-- Using client_package_stage_state rows where status != 'complete' for required stages
checklist_counts AS (
  SELECT
    cpss.tenant_id,
    cpss.package_id,
    cs.stage_id,
    COUNT(*) FILTER (WHERE cpss.status != 'complete' AND cpss.is_required = true AND cpss.stage_id = cs.stage_id) AS checklist_remaining
  FROM client_package_stage_state cpss
  JOIN current_stage cs ON cs.tenant_id = cpss.tenant_id AND cs.package_id = cpss.package_id
  WHERE cpss.stage_id = cs.stage_id
  GROUP BY cpss.tenant_id, cpss.package_id, cs.stage_id
),
-- Count required documents missing per tenant+package in current stage
doc_counts AS (
  SELECT
    cs.tenant_id,
    cs.package_id,
    cs.stage_id,
    COUNT(*) FILTER (
      WHERE d.document_status IS NULL
        OR d.document_status IN ('draft')
        OR d.uploaded_files IS NULL
        OR array_length(d.uploaded_files, 1) IS NULL
        OR array_length(d.uploaded_files, 1) = 0
    ) AS docs_remaining
  FROM current_stage cs
  LEFT JOIN documents d
    ON d.tenant_id = cs.tenant_id
    AND d.package_id = cs.package_id
    AND d.stage = cs.stage_id
  GROUP BY cs.tenant_id, cs.package_id, cs.stage_id
),
-- Count blocking risks (critical/high unresolved)
risk_counts AS (
  SELECT
    pi.tenant_id,
    pi.id AS package_instance_id,
    COUNT(*) FILTER (
      WHERE ei.status NOT IN ('Solved', 'Closed', 'Archived')
        AND ei.resolved_at IS NULL
        AND ei.deleted_at IS NULL
        AND ei.impact IN ('Critical', 'critical', 'High', 'high')
    ) AS risks_blocking
  FROM package_instances pi
  LEFT JOIN eos_issues ei ON ei.tenant_id = pi.tenant_id
  WHERE pi.is_complete = false
  GROUP BY pi.tenant_id, pi.id
),
-- Next milestone: next incomplete required stage after current
next_milestone AS (
  SELECT DISTINCT ON (cpss.tenant_id, cpss.package_id)
    cpss.tenant_id,
    cpss.package_id,
    ds.title AS next_milestone_label
  FROM client_package_stage_state cpss
  JOIN current_stage cs ON cs.tenant_id = cpss.tenant_id AND cs.package_id = cpss.package_id
  JOIN documents_stages ds ON ds.id = cpss.stage_id
  WHERE cpss.is_required = true
    AND cpss.status != 'complete'
    AND cpss.sort_order > cs.sort_order
  ORDER BY cpss.tenant_id, cpss.package_id, cpss.sort_order
)
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  pi.package_id,
  t.name AS client_name,
  p.name AS package_name,
  p.package_type,
  cs.phase_key,
  cs.phase_name,
  -- Counts
  COALESCE(cc.checklist_remaining, 0)::int AS checklist_remaining,
  COALESCE(dc.docs_remaining, 0)::int AS docs_remaining,
  0::int AS meetings_remaining,   -- placeholder until meeting-phase linking exists
  0::int AS approvals_remaining,  -- placeholder until approval tracking exists
  COALESCE(rc.risks_blocking, 0)::int AS risks_blocking,
  -- Total
  (
    COALESCE(cc.checklist_remaining, 0)
    + COALESCE(dc.docs_remaining, 0)
    + COALESCE(rc.risks_blocking, 0)
  )::int AS total_actions_remaining,
  -- Next milestone
  nm.next_milestone_label
FROM package_instances pi
JOIN tenants t ON t.id = pi.tenant_id
JOIN packages p ON p.id = pi.package_id
LEFT JOIN current_stage cs ON cs.tenant_id = pi.tenant_id AND cs.package_id = pi.package_id
LEFT JOIN checklist_counts cc ON cc.tenant_id = pi.tenant_id AND cc.package_id = pi.package_id
LEFT JOIN doc_counts dc ON dc.tenant_id = pi.tenant_id AND dc.package_id = pi.package_id
LEFT JOIN risk_counts rc ON rc.tenant_id = pi.tenant_id AND rc.package_instance_id = pi.id
LEFT JOIN next_milestone nm ON nm.tenant_id = pi.tenant_id AND nm.package_id = pi.package_id
WHERE pi.is_complete = false;
