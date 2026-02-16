
-- Phase 1+2: Add missing columns to research tables + audit log

-- Add stage_instance_id and standards_version to research_jobs
ALTER TABLE public.research_jobs 
  ADD COLUMN IF NOT EXISTS stage_instance_id uuid,
  ADD COLUMN IF NOT EXISTS standards_version text NOT NULL DEFAULT 'Standards for RTOs 2025';

-- Add risk_flags_json to research_findings  
ALTER TABLE public.research_findings 
  ADD COLUMN IF NOT EXISTS risk_flags_json jsonb;

-- Create research_audit_log for full action trail
CREATE TABLE IF NOT EXISTS public.research_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid REFERENCES public.research_jobs(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.research_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS: Vivacity team can read all audit logs
CREATE POLICY "vivacity_team_read_research_audit_log"
  ON public.research_audit_log
  FOR SELECT
  USING (is_vivacity_team_safe(auth.uid()));

-- RLS: Vivacity team can insert audit logs
CREATE POLICY "vivacity_team_insert_research_audit_log"
  ON public.research_audit_log
  FOR INSERT
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

-- SuperAdmin can read all
CREATE POLICY "superadmin_read_research_audit_log"
  ON public.research_audit_log
  FOR SELECT
  USING (is_super_admin_safe(auth.uid()));

-- Index for fast job-based lookups
CREATE INDEX IF NOT EXISTS idx_research_audit_log_job_id ON public.research_audit_log(job_id);
CREATE INDEX IF NOT EXISTS idx_research_audit_log_user_id ON public.research_audit_log(user_id);

-- Index for research_jobs filtering
CREATE INDEX IF NOT EXISTS idx_research_jobs_job_type ON public.research_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_research_jobs_status ON public.research_jobs(status);
CREATE INDEX IF NOT EXISTS idx_research_jobs_tenant_id ON public.research_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_research_jobs_created_at ON public.research_jobs(created_at DESC);
