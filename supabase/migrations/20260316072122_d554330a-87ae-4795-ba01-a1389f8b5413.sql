
-- Create dd_work_sub_type lookup table
CREATE TABLE public.dd_work_sub_type (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  category text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dd_work_sub_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dd_work_sub_type"
  ON public.dd_work_sub_type FOR SELECT TO authenticated USING (true);

CREATE POLICY "Vivacity staff can manage dd_work_sub_type"
  ON public.dd_work_sub_type FOR ALL TO authenticated
  USING (public.is_vivacity_staff(auth.uid()))
  WITH CHECK (public.is_vivacity_staff(auth.uid()));

-- Add work_sub_type column to time tables
ALTER TABLE public.time_entries ADD COLUMN work_sub_type text;
ALTER TABLE public.active_timers ADD COLUMN work_sub_type text;
ALTER TABLE public.calendar_time_drafts ADD COLUMN work_sub_type text;
