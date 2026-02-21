
-- Create dd_note_status lookup table
CREATE TABLE public.dd_note_status (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.dd_note_status ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read (global lookup)
CREATE POLICY "Anyone can read note statuses"
  ON public.dd_note_status FOR SELECT
  USING (true);

-- Seed rows
INSERT INTO public.dd_note_status (code, label, sort_order) VALUES
  ('attended', 'Attended', 1),
  ('not_attended', 'Not Attended', 2),
  ('late', 'Late', 3),
  ('completed', 'Completed', 4),
  ('scheduled', 'Scheduled', 5),
  ('abandoned', 'Abandoned', 6),
  ('noted', 'Noted', 7);

-- Add status column to notes table
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS status text;
