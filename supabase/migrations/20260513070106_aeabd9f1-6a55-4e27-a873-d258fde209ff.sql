CREATE TABLE public.dd_rock_type (
  id serial PRIMARY KEY,
  value text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dd_rock_type_value_key UNIQUE (value)
);

INSERT INTO public.dd_rock_type (value, label, sort_order) VALUES
  ('company',    'Company',    1),
  ('team',       'Team',       2),
  ('individual', 'Individual', 3)
ON CONFLICT (value) DO NOTHING;

ALTER TABLE public.dd_rock_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_rock_type_read"
  ON public.dd_rock_type
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "dd_rock_type_admin_write"
  ON public.dd_rock_type
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