
-- ============================================================
-- Phase 8: AI Template Gap Analysis Engine
-- ============================================================

-- 1) template_analysis_jobs
CREATE TABLE public.template_analysis_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid,
  template_version_id uuid,
  research_job_id uuid REFERENCES public.research_jobs(id),
  standards_version text NOT NULL DEFAULT 'Standards for RTOs 2025',
  generated_by_user_id uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','approved')),
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.template_analysis_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vivacity_read_template_analysis"
  ON public.template_analysis_jobs FOR SELECT TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "vivacity_insert_template_analysis"
  ON public.template_analysis_jobs FOR INSERT TO authenticated
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "vivacity_update_template_analysis"
  ON public.template_analysis_jobs FOR UPDATE TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));

CREATE INDEX idx_template_analysis_template ON public.template_analysis_jobs(template_id);
CREATE INDEX idx_template_analysis_status ON public.template_analysis_jobs(status);

-- 2) template_clause_mappings
CREATE TABLE public.template_clause_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_analysis_job_id uuid NOT NULL REFERENCES public.template_analysis_jobs(id) ON DELETE CASCADE,
  standard_clause text NOT NULL,
  coverage_status text NOT NULL CHECK (coverage_status IN ('explicit','implicit','weak','missing')),
  confidence_level text NOT NULL DEFAULT 'medium' CHECK (confidence_level IN ('high','medium','low')),
  supporting_excerpt text,
  improvement_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.template_clause_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vivacity_read_clause_mappings"
  ON public.template_clause_mappings FOR SELECT TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "vivacity_insert_clause_mappings"
  ON public.template_clause_mappings FOR INSERT TO authenticated
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

CREATE INDEX idx_clause_mappings_job ON public.template_clause_mappings(template_analysis_job_id);
CREATE INDEX idx_clause_mappings_status ON public.template_clause_mappings(coverage_status);

-- 3) template_gap_summary
CREATE TABLE public.template_gap_summary (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_analysis_job_id uuid NOT NULL REFERENCES public.template_analysis_jobs(id) ON DELETE CASCADE,
  total_clauses_checked integer NOT NULL DEFAULT 0,
  explicit_count integer NOT NULL DEFAULT 0,
  weak_count integer NOT NULL DEFAULT 0,
  missing_count integer NOT NULL DEFAULT 0,
  high_risk_gaps_count integer NOT NULL DEFAULT 0,
  summary_markdown text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.template_gap_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vivacity_read_gap_summary"
  ON public.template_gap_summary FOR SELECT TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "vivacity_insert_gap_summary"
  ON public.template_gap_summary FOR INSERT TO authenticated
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

CREATE INDEX idx_gap_summary_job ON public.template_gap_summary(template_analysis_job_id);
