
-- TAS Context Assistant tables

-- tas_context_briefs: store editable briefs linked to stages
CREATE TABLE public.tas_context_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  stage_instance_id bigint NOT NULL,
  qualification_code text,
  qualification_title text,
  delivery_mode text CHECK (delivery_mode IN ('onsite', 'online', 'blended', 'workplace', 'mixed')),
  audience_notes text,
  generated_from_job_id uuid REFERENCES public.research_jobs(id),
  brief_markdown text NOT NULL DEFAULT '',
  brief_json jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved')),
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by_user_id uuid,
  reviewed_at timestamptz
);

ALTER TABLE public.tas_context_briefs ENABLE ROW LEVEL SECURITY;

-- VivacityTeam + SuperAdmin can do everything
CREATE POLICY "vivacity_team_full_access" ON public.tas_context_briefs
  FOR ALL TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- Tenant users can read approved briefs for their tenant
CREATE POLICY "tenant_users_read_approved" ON public.tas_context_briefs
  FOR SELECT TO authenticated
  USING (
    status = 'approved'
    AND public.has_tenant_access_safe(tenant_id, auth.uid())
  );

-- tas_context_sources: link sources to briefs
CREATE TABLE public.tas_context_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tas_context_brief_id uuid NOT NULL REFERENCES public.tas_context_briefs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.research_jobs(id),
  source_id uuid NOT NULL REFERENCES public.research_sources(id),
  source_role text NOT NULL DEFAULT 'other' CHECK (source_role IN ('training_gov', 'client_site', 'other')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tas_context_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vivacity_team_full_access" ON public.tas_context_sources
  FOR ALL TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "tenant_users_read" ON public.tas_context_sources
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tas_context_briefs b
      WHERE b.id = tas_context_brief_id
        AND b.status = 'approved'
        AND public.has_tenant_access_safe(b.tenant_id, auth.uid())
    )
  );

-- Auto-update updated_at on tas_context_briefs
CREATE TRIGGER update_tas_context_briefs_updated_at
  BEFORE UPDATE ON public.tas_context_briefs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add tas_context_assistant to ResearchJobs filter (no enum changes needed, job_type is text)
