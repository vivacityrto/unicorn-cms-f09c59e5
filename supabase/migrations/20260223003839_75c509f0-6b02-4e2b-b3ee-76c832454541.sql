
-- Create dd_work_types lookup table
CREATE TABLE public.dd_work_types (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dd_work_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dd_work_types"
  ON public.dd_work_types FOR SELECT
  USING (auth.role() = 'authenticated');

-- Seed with existing work types
INSERT INTO public.dd_work_types (code, label, sort_order) VALUES
  ('general', 'General', 1),
  ('consultation', 'Consultation', 2),
  ('document_review', 'Document Review', 3),
  ('training', 'Training', 4),
  ('meeting', 'Meeting', 5),
  ('support', 'Support', 6),
  ('admin', 'Admin', 7);
