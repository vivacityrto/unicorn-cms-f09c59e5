-- Migration 1: Create and seed dd_meeting_role lookup table

CREATE TABLE public.dd_meeting_role (
  id          serial      NOT NULL,
  value       text        NOT NULL,
  label       text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dd_meeting_role_pkey PRIMARY KEY (id),
  CONSTRAINT dd_meeting_role_value_key UNIQUE (value)
);

INSERT INTO public.dd_meeting_role (value, label, sort_order) VALUES
  ('owner',      'Owner',      10),
  ('attendee',   'Attendee',   20),
  ('guest',      'Guest',      30),
  ('visionary',  'Visionary',  40),
  ('integrator', 'Integrator', 50),
  ('core_team',  'Core Team',  60);

ALTER TABLE public.dd_meeting_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON public.dd_meeting_role
  FOR SELECT USING (true);

DO $$ BEGIN
  IF (SELECT COUNT(*) FROM public.dd_meeting_role) != 6 THEN
    RAISE EXCEPTION 'Seed failed: dd_meeting_role does not have 6 rows';
  END IF;
END $$;