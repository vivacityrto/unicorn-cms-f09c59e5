
-- ============================================================
-- Phase 7: Cross-Tenant Risk Radar (complete)
-- ============================================================

-- 1) risk_theme_catalog
CREATE TABLE public.risk_theme_catalog (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  theme_label text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  related_standard_clauses text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_theme_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vivacity_read_risk_themes"
  ON public.risk_theme_catalog FOR SELECT TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "superadmin_manage_risk_themes"
  ON public.risk_theme_catalog FOR ALL TO authenticated
  USING (is_super_admin_safe(auth.uid()))
  WITH CHECK (is_super_admin_safe(auth.uid()));

INSERT INTO public.risk_theme_catalog (theme_label, description, related_standard_clauses) VALUES
  ('Marketing claims inconsistency', 'Marketing materials do not accurately reflect training products or outcomes.', ARRAY['1.7','4.1']),
  ('Trainer matrix gaps', 'Trainer and assessor qualifications or currency not fully evidenced.', ARRAY['1.13','1.14','1.15','1.16']),
  ('LLND documentation weaknesses', 'Insufficient evidence of LLN support processes and identification.', ARRAY['1.7','1.3']),
  ('Third-party oversight gaps', 'Inadequate monitoring or agreements with third-party arrangements.', ARRAY['2.3','2.4']),
  ('Assessment tool mapping issues', 'Assessment tools not mapped to unit requirements or packaging rules.', ARRAY['1.8','1.1','1.2']),
  ('Industry engagement evidence gaps', 'Insufficient evidence of industry consultation for TAS development.', ARRAY['1.5','1.6']),
  ('Validation records gaps', 'Validation not systematic or not involving industry participants.', ARRAY['1.9','1.10','1.11']),
  ('Internal audit deficiencies', 'Internal audit processes not covering all required areas.', ARRAY['2.2','6.1']),
  ('Student support evidence gaps', 'Insufficient evidence of learner support services and processes.', ARRAY['1.3','1.7','6.3']);

-- 2) risk_events
CREATE TABLE public.risk_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id bigint NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('public_snapshot','tas_context','audit_pack','evidence_gap','regulator_watch')),
  source_entity_id uuid,
  standard_clause text,
  risk_category text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  theme_label text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  detected_by_user_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','monitoring','addressed','closed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_own_risk_events"
  ON public.risk_events FOR SELECT TO authenticated
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "vivacity_read_all_risk_events"
  ON public.risk_events FOR SELECT TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "vivacity_insert_risk_events"
  ON public.risk_events FOR INSERT TO authenticated
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "vivacity_update_risk_events"
  ON public.risk_events FOR UPDATE TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));

CREATE INDEX idx_risk_events_tenant ON public.risk_events(tenant_id);
CREATE INDEX idx_risk_events_status ON public.risk_events(status);
CREATE INDEX idx_risk_events_severity ON public.risk_events(severity);
CREATE INDEX idx_risk_events_source ON public.risk_events(source_type);
CREATE INDEX idx_risk_events_detected ON public.risk_events(detected_at);
CREATE INDEX idx_risk_events_clause ON public.risk_events(standard_clause);
CREATE INDEX idx_risk_events_theme ON public.risk_events(theme_label);

-- 3) Ingestion trigger
CREATE OR REPLACE FUNCTION public.ingest_risk_events_from_findings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id bigint;
  v_job_type text;
  v_created_by uuid;
  v_source_type text;
  v_flag jsonb;
BEGIN
  IF NEW.risk_flags_json IS NULL OR jsonb_array_length(NEW.risk_flags_json) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT rj.tenant_id, rj.job_type, rj.created_by
    INTO v_tenant_id, v_job_type, v_created_by
    FROM public.research_jobs rj
    WHERE rj.id = NEW.job_id;

  IF v_tenant_id IS NULL THEN RETURN NEW; END IF;

  v_source_type := CASE v_job_type
    WHEN 'public_compliance_snapshot' THEN 'public_snapshot'
    WHEN 'tas_context_assistant' THEN 'tas_context'
    WHEN 'audit_intelligence_pack' THEN 'audit_pack'
    WHEN 'evidence_gap_check' THEN 'evidence_gap'
    WHEN 'regulator_watch' THEN 'regulator_watch'
    ELSE 'public_snapshot'
  END;

  FOR v_flag IN SELECT jsonb_array_elements(NEW.risk_flags_json)
  LOOP
    INSERT INTO public.risk_events (
      tenant_id, source_type, source_entity_id,
      standard_clause, risk_category, severity,
      theme_label, detected_by_user_id
    ) VALUES (
      v_tenant_id, v_source_type, NEW.job_id,
      v_flag->>'standard_clause',
      v_flag->>'category',
      COALESCE(v_flag->>'severity', 'medium'),
      v_flag->>'theme',
      v_created_by
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ingest_risk_events
  AFTER INSERT OR UPDATE OF risk_flags_json
  ON public.research_findings
  FOR EACH ROW
  EXECUTE FUNCTION public.ingest_risk_events_from_findings();

-- 4) Materialized view for 7-day trends (using UNION + LEFT JOIN instead of FULL JOIN)
CREATE MATERIALIZED VIEW public.v_risk_trends_7d AS
WITH current_week AS (
  SELECT
    COALESCE(standard_clause, 'unspecified') AS standard_clause,
    COALESCE(theme_label, 'unspecified') AS theme_label,
    severity,
    count(*) AS risk_count
  FROM public.risk_events
  WHERE detected_at >= (now() - interval '7 days')
  GROUP BY 1, 2, 3
),
prior_week AS (
  SELECT
    COALESCE(standard_clause, 'unspecified') AS standard_clause,
    COALESCE(theme_label, 'unspecified') AS theme_label,
    severity,
    count(*) AS risk_count
  FROM public.risk_events
  WHERE detected_at >= (now() - interval '14 days')
    AND detected_at < (now() - interval '7 days')
  GROUP BY 1, 2, 3
),
all_keys AS (
  SELECT standard_clause, theme_label, severity FROM current_week
  UNION
  SELECT standard_clause, theme_label, severity FROM prior_week
)
SELECT
  ak.standard_clause,
  ak.theme_label,
  ak.severity,
  COALESCE(c.risk_count, 0) AS current_count,
  COALESCE(p.risk_count, 0) AS prior_count,
  COALESCE(c.risk_count, 0) - COALESCE(p.risk_count, 0) AS trend_delta
FROM all_keys ak
LEFT JOIN current_week c ON c.standard_clause = ak.standard_clause AND c.theme_label = ak.theme_label AND c.severity = ak.severity
LEFT JOIN prior_week p ON p.standard_clause = ak.standard_clause AND p.theme_label = ak.theme_label AND p.severity = ak.severity;

GRANT SELECT ON public.v_risk_trends_7d TO authenticated;
