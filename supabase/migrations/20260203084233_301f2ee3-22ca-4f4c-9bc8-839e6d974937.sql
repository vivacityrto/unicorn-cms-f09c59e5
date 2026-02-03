-- Seat Health Scores table (calculated nightly)
CREATE TABLE IF NOT EXISTS public.seat_health_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id),
  seat_id UUID NOT NULL REFERENCES public.accountability_seats(id) ON DELETE CASCADE,
  
  -- Score components (0-100 each)
  rocks_score INTEGER NOT NULL DEFAULT 0,
  todos_score INTEGER NOT NULL DEFAULT 0,
  ids_score INTEGER NOT NULL DEFAULT 0,
  cadence_score INTEGER NOT NULL DEFAULT 0,
  gwc_score INTEGER NOT NULL DEFAULT 0,
  
  -- Total weighted score (0-100)
  total_score INTEGER NOT NULL DEFAULT 0,
  
  -- Health band: 'healthy', 'at_risk', 'overloaded'
  health_band TEXT NOT NULL DEFAULT 'healthy' CHECK (health_band IN ('healthy', 'at_risk', 'overloaded')),
  
  -- Top contributing factors (JSONB array)
  contributing_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Calculation metadata
  calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  quarter_year INTEGER NOT NULL,
  quarter_number INTEGER NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint per seat per quarter
  UNIQUE(seat_id, quarter_year, quarter_number)
);

-- Enable RLS
ALTER TABLE public.seat_health_scores ENABLE ROW LEVEL SECURITY;

-- RLS policy: Only Vivacity team can access
CREATE POLICY "Vivacity team can view seat health scores" ON public.seat_health_scores
  FOR SELECT USING (public.is_vivacity_team());

CREATE POLICY "Vivacity team can manage seat health scores" ON public.seat_health_scores
  FOR ALL USING (public.is_vivacity_team());

-- Seat Rebalancing Recommendations table
CREATE TABLE IF NOT EXISTS public.seat_rebalancing_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id),
  seat_id UUID NOT NULL REFERENCES public.accountability_seats(id) ON DELETE CASCADE,
  
  -- Recommendation type
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN (
    'reduce_rock_load',
    'move_rock',
    'add_backup',
    'split_seat'
  )),
  
  -- Recommendation details
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Suggested targets (for move_rock or add_backup)
  suggested_rocks JSONB DEFAULT '[]'::jsonb,
  suggested_users JSONB DEFAULT '[]'::jsonb,
  suggested_seats JSONB DEFAULT '[]'::jsonb,
  
  -- Lifecycle status
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'action_taken', 'dismissed')),
  dismissed_reason TEXT,
  dismissed_by UUID REFERENCES auth.users(id),
  dismissed_at TIMESTAMP WITH TIME ZONE,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id),
  
  -- Trigger info
  trigger_type TEXT NOT NULL,
  trigger_details JSONB,
  
  -- Quarter context
  quarter_year INTEGER NOT NULL,
  quarter_number INTEGER NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.seat_rebalancing_recommendations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Vivacity team can view recommendations" ON public.seat_rebalancing_recommendations
  FOR SELECT USING (public.is_vivacity_team());

CREATE POLICY "Vivacity team can manage recommendations" ON public.seat_rebalancing_recommendations
  FOR ALL USING (public.is_vivacity_team());

-- Index for fast lookups
CREATE INDEX idx_seat_health_seat_id ON public.seat_health_scores(seat_id);
CREATE INDEX idx_seat_health_band ON public.seat_health_scores(health_band);
CREATE INDEX idx_seat_recommendations_seat_id ON public.seat_rebalancing_recommendations(seat_id);
CREATE INDEX idx_seat_recommendations_status ON public.seat_rebalancing_recommendations(status);

-- Audit logging for seat health events
CREATE TABLE IF NOT EXISTS public.audit_seat_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id),
  seat_id UUID REFERENCES public.accountability_seats(id) ON DELETE SET NULL,
  recommendation_id UUID REFERENCES public.seat_rebalancing_recommendations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id),
  
  event_type TEXT NOT NULL CHECK (event_type IN (
    'seat_health_calculated',
    'recommendation_created',
    'recommendation_acknowledged',
    'recommendation_dismissed',
    'recommendation_resolved'
  )),
  
  details JSONB,
  reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_seat_health ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "Vivacity team can view seat health audit" ON public.audit_seat_health
  FOR SELECT USING (public.is_vivacity_team());

CREATE POLICY "Vivacity team can insert seat health audit" ON public.audit_seat_health
  FOR INSERT WITH CHECK (public.is_vivacity_team());

-- Trigger for updated_at
CREATE TRIGGER update_seat_health_scores_updated_at
  BEFORE UPDATE ON public.seat_health_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_seat_recommendations_updated_at
  BEFORE UPDATE ON public.seat_rebalancing_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();