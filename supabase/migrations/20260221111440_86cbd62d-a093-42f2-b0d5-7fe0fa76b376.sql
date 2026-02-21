
-- Create dd_note_types lookup table
CREATE TABLE public.dd_note_types (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.dd_note_types ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read
CREATE POLICY "Anyone can read note types"
  ON public.dd_note_types FOR SELECT
  USING (true);

-- Seed with existing types + email
INSERT INTO public.dd_note_types (code, label, sort_order) VALUES
  ('general', 'General', 1),
  ('follow-up', 'Follow-up', 2),
  ('phone-call', 'Phone Call', 3),
  ('meeting', 'Meeting', 4),
  ('action', 'Action', 5),
  ('email', 'Email', 6),
  ('tenant', 'Tenant', 7),
  ('risk', 'Risk', 8),
  ('escalation', 'Escalation', 9);
