CREATE TABLE IF NOT EXISTS public.dd_eos_meeting_type (
  id serial PRIMARY KEY,
  value text UNIQUE NOT NULL,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dd_eos_meeting_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_eos_meeting_type is readable by everyone"
ON public.dd_eos_meeting_type
FOR SELECT
USING (true);

INSERT INTO public.dd_eos_meeting_type (value, label, sort_order) VALUES
  ('L10', 'Level 10', 1),
  ('Quarterly', 'Quarterly', 2),
  ('Annual', 'Annual', 3),
  ('Focus_Day', 'Focus Day', 4),
  ('Custom', 'Custom', 5),
  ('Same_Page', 'Same Page', 6)
ON CONFLICT (value) DO NOTHING;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.dd_eos_meeting_type;
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'Expected 6 rows in dd_eos_meeting_type, found %', v_count;
  END IF;
END $$;