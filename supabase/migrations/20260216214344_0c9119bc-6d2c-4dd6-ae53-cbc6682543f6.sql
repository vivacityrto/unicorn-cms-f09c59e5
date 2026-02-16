
-- Phase 3: Regulator Watch — watchlist table
CREATE TABLE public.regulator_watchlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  name TEXT NOT NULL,
  check_frequency TEXT NOT NULL DEFAULT 'weekly',
  last_checked_at TIMESTAMPTZ,
  last_content_hash TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.regulator_watchlist ENABLE ROW LEVEL SECURITY;

-- SuperAdmin full access
CREATE POLICY "superadmin_full_access_regulator_watchlist"
  ON public.regulator_watchlist FOR ALL
  USING (is_super_admin_safe(auth.uid()));

-- Vivacity Team read access
CREATE POLICY "vivacity_team_select_regulator_watchlist"
  ON public.regulator_watchlist FOR SELECT
  USING (is_vivacity_team_safe(auth.uid()));

-- Pre-populate with key regulator pages
INSERT INTO public.regulator_watchlist (url, name, created_by) VALUES
  ('https://www.asqa.gov.au/standards', 'ASQA Standards', '00000000-0000-0000-0000-000000000000'),
  ('https://www.dewr.gov.au/skills-and-training', 'DEWR Skills & Training', '00000000-0000-0000-0000-000000000000'),
  ('https://www.legislation.gov.au/Series/F2017L01182', 'CRICOS National Code 2018', '00000000-0000-0000-0000-000000000000'),
  ('https://www.asqa.gov.au/rtos/standards-for-rtos-2025', 'Standards for RTOs 2025', '00000000-0000-0000-0000-000000000000');
