-- Migration: dd_stage_state lookup table
-- Retains legacy stage_state enum type (no column uses it).

CREATE TABLE public.dd_stage_state (
  id serial PRIMARY KEY,
  value text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dd_stage_state_value_key UNIQUE (value)
);

INSERT INTO public.dd_stage_state (value, label, sort_order) VALUES
  ('not_started',    'Not Started',    1),
  ('active',         'Active',         2),
  ('blocked',        'Blocked',        3),
  ('complete',       'Complete',       4),
  ('not_applicable', 'Not Applicable', 5);

ALTER TABLE public.dd_stage_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_stage_state_read_all"
  ON public.dd_stage_state
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "dd_stage_state_superadmin_write"
  ON public.dd_stage_state
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_uuid = (SELECT auth.uid())
        AND users.unicorn_role = 'Super Admin'::unicorn_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_uuid = (SELECT auth.uid())
        AND users.unicorn_role = 'Super Admin'::unicorn_role
    )
  );

-- Rollback:
--   DROP TABLE IF EXISTS public.dd_stage_state;
--   -- stage_state enum type is retained throughout, no further rollback needed

-- Post-deploy verification:
--   SELECT COUNT(*) FROM public.dd_stage_state; -- expect 5
--   SELECT value FROM public.dd_stage_state ORDER BY sort_order; -- expect not_started, active, blocked, complete, not_applicable
--   SELECT typname FROM pg_type WHERE typname = 'stage_state'; -- expect 1 row