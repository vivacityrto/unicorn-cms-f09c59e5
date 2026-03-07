
-- Create dd_stage_types lookup table
CREATE TABLE public.dd_stage_types (
  value text PRIMARY KEY,
  label text NOT NULL,
  color text NOT NULL DEFAULT 'bg-muted text-muted-foreground',
  is_milestone boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.dd_stage_types ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Authenticated users can read dd_stage_types"
  ON public.dd_stage_types
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed data
INSERT INTO public.dd_stage_types (value, label, color, is_milestone, sort_order) VALUES
  ('onboarding',    'Onboarding',       'bg-blue-500/10 text-blue-600 border-blue-500/20',    true,  10),
  ('delivery',      'Delivery',         'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', true,  20),
  ('documentation', 'Documentation',    'bg-teal-500/10 text-teal-600 border-teal-500/20',    true,  30),
  ('support',       'Ongoing Support',  'bg-purple-500/10 text-purple-600 border-purple-500/20',   false, 40),
  ('monitoring',    'Monitoring',       'bg-amber-500/10 text-amber-600 border-amber-500/20',  false, 50),
  ('offboarding',   'Offboarding',      'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',    false, 60);
