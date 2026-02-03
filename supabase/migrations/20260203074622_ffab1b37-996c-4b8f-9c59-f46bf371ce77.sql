-- EOS Health Score Historical Snapshots
-- Stores nightly calculated health scores for trend analysis

CREATE TABLE public.eos_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  overall_score smallint NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  overall_band text NOT NULL CHECK (overall_band IN ('at_risk', 'needs_attention', 'healthy', 'strong')),
  cadence_score smallint NOT NULL CHECK (cadence_score >= 0 AND cadence_score <= 100),
  rocks_score smallint NOT NULL CHECK (rocks_score >= 0 AND rocks_score <= 100),
  ids_score smallint NOT NULL CHECK (ids_score >= 0 AND ids_score <= 100),
  people_score smallint NOT NULL CHECK (people_score >= 0 AND people_score <= 100),
  quarterly_score smallint NOT NULL CHECK (quarterly_score >= 0 AND quarterly_score <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, snapshot_date)
);

-- Index for efficient queries
CREATE INDEX idx_eos_health_snapshots_tenant_date 
ON public.eos_health_snapshots(tenant_id, snapshot_date DESC);

-- Enable RLS
ALTER TABLE public.eos_health_snapshots ENABLE ROW LEVEL SECURITY;

-- Policies: Users can view their own tenant's health snapshots
CREATE POLICY "Users can view their tenant health snapshots"
ON public.eos_health_snapshots
FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()
  )
);

-- Staff can view all health snapshots
CREATE POLICY "Staff can view all health snapshots"
ON public.eos_health_snapshots
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  )
);

-- System insert policy (for nightly calculation job)
CREATE POLICY "System can insert health snapshots"
ON public.eos_health_snapshots
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND unicorn_role IN ('Super Admin', 'Team Leader')
  )
);