DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dd_meeting_status'
  ) THEN
    RAISE EXCEPTION 'dd_meeting_status already exists — check before proceeding';
  END IF;
END $$;

CREATE TABLE public.dd_meeting_status (
  id         serial      NOT NULL,
  value      text        NOT NULL,
  label      text        NOT NULL,
  sort_order integer     NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dd_meeting_status_pkey PRIMARY KEY (id),
  CONSTRAINT dd_meeting_status_value_key UNIQUE (value)
);

INSERT INTO public.dd_meeting_status (value, label, sort_order) VALUES
  ('scheduled',      'Scheduled',      10),
  ('in_progress',    'In Progress',    20),
  ('ready_to_close', 'Ready to Close', 30),
  ('completed',      'Completed',      40),
  ('closed',         'Closed',         50),
  ('cancelled',      'Cancelled',      60),
  ('locked',         'Locked',         70);

ALTER TABLE public.dd_meeting_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_meeting_status: public read"
  ON public.dd_meeting_status
  FOR SELECT USING (true);

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.dd_meeting_status) != 7 THEN
    RAISE EXCEPTION 'dd_meeting_status seed check failed — expected 7 rows';
  END IF;
  IF EXISTS (
    SELECT unnest(ARRAY['scheduled','in_progress','ready_to_close','completed','closed','cancelled','locked'])
    EXCEPT
    SELECT value FROM public.dd_meeting_status
  ) THEN
    RAISE EXCEPTION 'dd_meeting_status seed check failed — missing expected values';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'eos_meetings'
      AND column_name = 'status' AND udt_name = 'meeting_status'
  ) THEN
    RAISE EXCEPTION 'Pre-flight check failed — eos_meetings.status is not the meeting_status enum (Migration 1 should not alter the column)';
  END IF;
  RAISE NOTICE 'Migration 1 complete: dd_meeting_status created and seeded with 7 rows.';
END $$;