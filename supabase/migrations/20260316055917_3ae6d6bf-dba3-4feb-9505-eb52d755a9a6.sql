
-- Create dd_package_type lookup table
CREATE TABLE public.dd_package_type (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Create dd_progress_mode lookup table
CREATE TABLE public.dd_progress_mode (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Seed dd_package_type
INSERT INTO public.dd_package_type (code, label, sort_order) VALUES
  ('audit', 'Audit', 1),
  ('membership', 'Membership', 2),
  ('project', 'Project', 3),
  ('regulatory_submission', 'Regulatory Submission', 4);

-- Seed dd_progress_mode
INSERT INTO public.dd_progress_mode (code, label, sort_order) VALUES
  ('entitlement_milestone', 'Entitlement Milestone', 1),
  ('milestone_based', 'Milestone Based', 2),
  ('phase_based', 'Phase Based', 3),
  ('stage_completion', 'Stage Completion', 4);

-- Fix typo in packages table
UPDATE public.packages SET progress_mode = 'stage_completion' WHERE progress_mode = 'stage_complettion';

-- Enable RLS
ALTER TABLE public.dd_package_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_progress_mode ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Authenticated users can read dd_package_type"
  ON public.dd_package_type FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read dd_progress_mode"
  ON public.dd_progress_mode FOR SELECT TO authenticated USING (true);

-- Manage access for Vivacity team
CREATE POLICY "Vivacity team can manage dd_package_type"
  ON public.dd_package_type FOR ALL TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "Vivacity team can manage dd_progress_mode"
  ON public.dd_progress_mode FOR ALL TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));
