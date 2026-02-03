-- People Analyzer Entries - Core Values ratings from Quarterly Conversations
CREATE TABLE IF NOT EXISTS public.people_analyzer_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  qc_id UUID NOT NULL REFERENCES public.eos_qc(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  seat_id UUID REFERENCES public.accountability_seats(id) ON DELETE SET NULL,
  core_value_id TEXT NOT NULL,
  core_value_text TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('Plus', 'PlusMinus', 'Minus')),
  assessed_by TEXT NOT NULL CHECK (assessed_by IN ('Manager', 'TeamMember', 'Self')),
  quarter_year INTEGER NOT NULL,
  quarter_number INTEGER NOT NULL CHECK (quarter_number BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  
  UNIQUE(qc_id, user_id, core_value_id, assessed_by)
);

-- Enable RLS
ALTER TABLE public.people_analyzer_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies - simplified to avoid missing table references
CREATE POLICY "Staff can view all entries"
ON public.people_analyzer_entries FOR SELECT
TO authenticated
USING (public.is_staff());

CREATE POLICY "Users can view own entries"
ON public.people_analyzer_entries FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Staff can insert entries"
ON public.people_analyzer_entries FOR INSERT
TO authenticated
WITH CHECK (public.is_staff());

-- People Analyzer Trends (calculated/cached view)
CREATE TABLE IF NOT EXISTS public.people_analyzer_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  seat_id UUID REFERENCES public.accountability_seats(id) ON DELETE SET NULL,
  core_value_id TEXT NOT NULL,
  core_value_text TEXT NOT NULL,
  
  -- Period info
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  quarter_year INTEGER NOT NULL,
  quarter_number INTEGER NOT NULL CHECK (quarter_number BETWEEN 1 AND 4),
  
  -- Calculated rates (0.0 to 1.0)
  plus_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  plus_minus_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  minus_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  
  -- Trend direction based on last 3-6 quarters
  trend TEXT NOT NULL DEFAULT 'Stable' CHECK (trend IN ('Improving', 'Stable', 'Declining')),
  
  -- Manager vs TeamMember divergence
  manager_rating TEXT,
  team_member_rating TEXT,
  has_divergence BOOLEAN DEFAULT FALSE,
  
  -- Flags
  consecutive_minus_count INTEGER DEFAULT 0,
  is_at_risk BOOLEAN DEFAULT FALSE,
  
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, core_value_id, quarter_year, quarter_number)
);

-- Enable RLS
ALTER TABLE public.people_analyzer_trends ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Staff can view all trends"
ON public.people_analyzer_trends FOR SELECT
TO authenticated
USING (public.is_staff());

CREATE POLICY "Users can view own trends"
ON public.people_analyzer_trends FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Staff can upsert trends"
ON public.people_analyzer_trends FOR ALL
TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- Audit table for People Analyzer
CREATE TABLE IF NOT EXISTS public.audit_people_analyzer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID,
  entry_id UUID REFERENCES public.people_analyzer_entries(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_people_analyzer ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view audit"
ON public.audit_people_analyzer FOR SELECT
TO authenticated
USING (public.is_staff());

CREATE POLICY "Staff can insert audit"
ON public.audit_people_analyzer FOR INSERT
TO authenticated
WITH CHECK (public.is_staff());

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pa_entries_user ON public.people_analyzer_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_pa_entries_qc ON public.people_analyzer_entries(qc_id);
CREATE INDEX IF NOT EXISTS idx_pa_entries_quarter ON public.people_analyzer_entries(quarter_year, quarter_number);
CREATE INDEX IF NOT EXISTS idx_pa_trends_user ON public.people_analyzer_trends(user_id);
CREATE INDEX IF NOT EXISTS idx_pa_trends_seat ON public.people_analyzer_trends(seat_id);
CREATE INDEX IF NOT EXISTS idx_pa_trends_risk ON public.people_analyzer_trends(is_at_risk) WHERE is_at_risk = TRUE;