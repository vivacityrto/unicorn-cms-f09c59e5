
-- Phase 4: Regulator Change Watch Engine

-- 1) Add missing columns to regulator_watchlist
ALTER TABLE public.regulator_watchlist
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'guidance',
  ADD COLUMN IF NOT EXISTS check_frequency_days integer DEFAULT 7;

-- Add constraint for category values
ALTER TABLE public.regulator_watchlist
  ADD CONSTRAINT regulator_watchlist_category_check
  CHECK (category IN ('standards', 'guidance', 'fact_sheet', 'audit_focus', 'legislation'));

-- Update existing rows to have defaults
UPDATE public.regulator_watchlist SET category = 'guidance' WHERE category IS NULL;
UPDATE public.regulator_watchlist SET check_frequency_days = 7 WHERE check_frequency_days IS NULL;

-- 2) Create regulator_change_events table
CREATE TABLE public.regulator_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL REFERENCES public.regulator_watchlist(id) ON DELETE CASCADE,
  research_job_id uuid NOT NULL REFERENCES public.research_jobs(id) ON DELETE CASCADE,
  previous_hash text,
  new_hash text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  impact_level text NOT NULL DEFAULT 'moderate',
  review_status text NOT NULL DEFAULT 'pending',
  change_summary_md text,
  affected_areas_json jsonb,
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT regulator_change_events_impact_check CHECK (impact_level IN ('low', 'moderate', 'high', 'critical')),
  CONSTRAINT regulator_change_events_review_check CHECK (review_status IN ('pending', 'reviewed', 'actioned'))
);

-- Index for lookups
CREATE INDEX idx_regulator_change_events_watchlist ON public.regulator_change_events(watchlist_id);
CREATE INDEX idx_regulator_change_events_review ON public.regulator_change_events(review_status);
CREATE INDEX idx_regulator_change_events_impact ON public.regulator_change_events(impact_level);

-- 3) RLS for regulator_watchlist
ALTER TABLE public.regulator_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity staff can manage watchlist"
  ON public.regulator_watchlist FOR ALL
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "SuperAdmin full access watchlist"
  ON public.regulator_watchlist FOR ALL
  USING (is_super_admin_safe(auth.uid()));

-- 4) RLS for regulator_change_events
ALTER TABLE public.regulator_change_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity staff can view change events"
  ON public.regulator_change_events FOR SELECT
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "SuperAdmin full access change events"
  ON public.regulator_change_events FOR ALL
  USING (is_super_admin_safe(auth.uid()));

CREATE POLICY "Vivacity staff can update change events"
  ON public.regulator_change_events FOR UPDATE
  USING (is_vivacity_team_safe(auth.uid()));
