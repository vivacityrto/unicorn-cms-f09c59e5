
-- Phase 6: Client Portal Evidence Gap Checker

-- 1) stage_required_evidence_categories – defines what evidence is needed per stage type
CREATE TABLE public.stage_required_evidence_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_type TEXT NOT NULL,
  category_name TEXT NOT NULL,
  category_description TEXT NOT NULL DEFAULT '',
  related_standard_clause TEXT NOT NULL DEFAULT '',
  mandatory_flag BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stage_required_evidence_categories ENABLE ROW LEVEL SECURITY;

-- Vivacity team manages categories
CREATE POLICY "vivacity_team_full_access"
  ON public.stage_required_evidence_categories
  FOR ALL TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- All authenticated users can read categories
CREATE POLICY "authenticated_read"
  ON public.stage_required_evidence_categories
  FOR SELECT TO authenticated
  USING (true);

-- Seed default evidence categories
INSERT INTO public.stage_required_evidence_categories (stage_type, category_name, category_description, related_standard_clause, mandatory_flag) VALUES
  ('default', 'Trainer and Assessor Matrix', 'Evidence of trainer/assessor qualifications, vocational competency, and currency', 'Clause 1.13–1.16', true),
  ('default', 'Assessment Tools', 'Validated assessment tools aligned to units of competency', 'Clause 1.8–1.12', true),
  ('default', 'LLND Process', 'Language, Literacy, Numeracy and Digital literacy support processes', 'Clause 1.7', true),
  ('default', 'Industry Engagement Evidence', 'Records of industry consultation for training and assessment strategies', 'Clause 1.25–1.26', true),
  ('default', 'Marketing Materials', 'Public-facing course information and marketing claims', 'Clause 4.1', true),
  ('default', 'Third Party Agreements', 'Formal agreements with third-party delivery or assessment partners', 'Clause 2.3–2.4', true),
  ('default', 'Student Support Evidence', 'Learner support services and pre-enrolment information', 'Clause 1.7, 5.1–5.4', true),
  ('default', 'Validation Records', 'Systematic validation of assessment practices and judgements', 'Clause 1.9', true),
  ('default', 'Internal Audit Records', 'Systematic monitoring and evaluation evidence', 'Clause 2.2', false),
  ('default', 'Work Placement Evidence', 'Workplace arrangements, agreements, and supervision records', 'Clause 1.3, 2.3', false),
  ('default', 'Enrolment and Completion Records', 'Student enrolment data, progress tracking, and completions', 'Clause 3.1–3.6', false),
  ('default', 'Complaints and Appeals Records', 'Documented complaints and appeals processes and outcomes', 'Clause 6.1–6.6', false);

-- 2) evidence_gap_checks – stores gap check results
CREATE TABLE public.evidence_gap_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  stage_instance_id BIGINT NOT NULL,
  research_job_id UUID NOT NULL REFERENCES public.research_jobs(id),
  generated_by_user_id UUID NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  required_categories_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  detected_categories_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_categories_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved')),
  reviewed_by_user_id UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.evidence_gap_checks ENABLE ROW LEVEL SECURITY;

-- Vivacity team full access
CREATE POLICY "vivacity_team_full_access"
  ON public.evidence_gap_checks
  FOR ALL TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- Tenant users can read their own gap checks
CREATE POLICY "tenant_users_read_own"
  ON public.evidence_gap_checks
  FOR SELECT TO authenticated
  USING (public.has_tenant_access_safe(tenant_id, auth.uid()));

-- Tenant users can create gap checks for their tenant
CREATE POLICY "tenant_users_create"
  ON public.evidence_gap_checks
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_access_safe(tenant_id, auth.uid()));

-- Updated_at trigger
CREATE TRIGGER update_evidence_gap_checks_updated_at
  BEFORE UPDATE ON public.evidence_gap_checks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_egc_tenant_id ON public.evidence_gap_checks(tenant_id);
CREATE INDEX idx_egc_stage_instance_id ON public.evidence_gap_checks(stage_instance_id);
CREATE INDEX idx_egc_status ON public.evidence_gap_checks(status);
