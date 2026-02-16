
-- ============================================================
-- Research Pipeline Tables for Perplexity + Firecrawl integration
-- ============================================================

-- research_jobs: top-level job tracking
CREATE TABLE public.research_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id bigint REFERENCES public.tenants(id),
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  input_json jsonb DEFAULT '{}'::jsonb,
  output_json jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.research_jobs ENABLE ROW LEVEL SECURITY;

-- Vivacity team can read all jobs
CREATE POLICY "vivacity_team_read_all_research_jobs"
  ON public.research_jobs FOR SELECT
  TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));

-- Tenant users can read jobs scoped to their tenant
CREATE POLICY "tenant_users_read_own_research_jobs"
  ON public.research_jobs FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND has_tenant_access_safe(tenant_id, auth.uid())
  );

-- Vivacity team can insert jobs
CREATE POLICY "vivacity_team_insert_research_jobs"
  ON public.research_jobs FOR INSERT
  TO authenticated
  WITH CHECK (is_vivacity_team_safe(auth.uid()) AND created_by = auth.uid());

-- Vivacity team can update jobs (status changes)
CREATE POLICY "vivacity_team_update_research_jobs"
  ON public.research_jobs FOR UPDATE
  TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));

-- ============================================================
-- research_sources: scraped content per URL
-- ============================================================

CREATE TABLE public.research_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.research_jobs(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  content_hash text,
  raw_markdown text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.research_sources ENABLE ROW LEVEL SECURITY;

-- Inherit read access from parent job
CREATE POLICY "read_research_sources_via_job"
  ON public.research_sources FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.research_jobs j
      WHERE j.id = job_id
    )
  );

-- Vivacity team can insert sources
CREATE POLICY "vivacity_team_insert_research_sources"
  ON public.research_sources FOR INSERT
  TO authenticated
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

-- ============================================================
-- research_findings: synthesised answers with citations
-- ============================================================

CREATE TABLE public.research_findings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.research_jobs(id) ON DELETE CASCADE,
  summary_md text,
  citations_json jsonb DEFAULT '[]'::jsonb,
  review_status text NOT NULL DEFAULT 'draft',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.research_findings ENABLE ROW LEVEL SECURITY;

-- Inherit read access from parent job
CREATE POLICY "read_research_findings_via_job"
  ON public.research_findings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.research_jobs j
      WHERE j.id = job_id
    )
  );

-- Vivacity team can insert findings
CREATE POLICY "vivacity_team_insert_research_findings"
  ON public.research_findings FOR INSERT
  TO authenticated
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

-- Only Vivacity team can update findings (approve/reject)
CREATE POLICY "vivacity_team_update_research_findings"
  ON public.research_findings FOR UPDATE
  TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));

-- Indexes for performance
CREATE INDEX idx_research_jobs_tenant ON public.research_jobs(tenant_id);
CREATE INDEX idx_research_jobs_status ON public.research_jobs(status);
CREATE INDEX idx_research_jobs_type ON public.research_jobs(job_type);
CREATE INDEX idx_research_sources_job ON public.research_sources(job_id);
CREATE INDEX idx_research_findings_job ON public.research_findings(job_id);
CREATE INDEX idx_research_findings_review ON public.research_findings(review_status);
