
-- Phase 5: Audit Intelligence Pack Generator

-- Create audit_intelligence_packs table
CREATE TABLE public.audit_intelligence_packs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  research_job_id UUID NOT NULL REFERENCES public.research_jobs(id),
  audit_type TEXT NOT NULL CHECK (audit_type IN ('initial_registration', 're_registration', 'extension_to_scope', 'strategic_review', 'post_audit_response')),
  delivery_mode TEXT,
  cricos_flag BOOLEAN NOT NULL DEFAULT false,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by_user_id UUID NOT NULL,
  summary_markdown TEXT NOT NULL DEFAULT '',
  focus_areas_json JSONB DEFAULT '[]'::jsonb,
  risk_trends_json JSONB DEFAULT '[]'::jsonb,
  preparation_checklist_json JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved')),
  reviewed_by_user_id UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_intelligence_packs ENABLE ROW LEVEL SECURITY;

-- VivacityTeam can do everything
CREATE POLICY "vivacity_team_full_access"
  ON public.audit_intelligence_packs
  FOR ALL
  TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- Tenant users can read approved packs for their tenant
CREATE POLICY "tenant_users_read_approved"
  ON public.audit_intelligence_packs
  FOR SELECT
  TO authenticated
  USING (
    status = 'approved'
    AND public.has_tenant_access_safe(tenant_id, auth.uid())
  );

-- Updated_at trigger
CREATE TRIGGER update_audit_intelligence_packs_updated_at
  BEFORE UPDATE ON public.audit_intelligence_packs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes
CREATE INDEX idx_aip_tenant_id ON public.audit_intelligence_packs(tenant_id);
CREATE INDEX idx_aip_research_job_id ON public.audit_intelligence_packs(research_job_id);
CREATE INDEX idx_aip_status ON public.audit_intelligence_packs(status);
