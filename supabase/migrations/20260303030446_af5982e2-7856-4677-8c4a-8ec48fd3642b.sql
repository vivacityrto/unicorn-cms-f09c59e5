
-- Create dd_unicorn_roles lookup table
CREATE TABLE public.dd_unicorn_roles (
  id serial PRIMARY KEY,
  label text NOT NULL,
  value text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dd_unicorn_roles ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Authenticated users can read unicorn roles"
  ON public.dd_unicorn_roles FOR SELECT
  TO authenticated
  USING (true);

-- Only SuperAdmins can modify (via code_table_operation RPC)
CREATE POLICY "Service role can manage unicorn roles"
  ON public.dd_unicorn_roles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed existing roles
INSERT INTO public.dd_unicorn_roles (label, value, description, sort_order) VALUES
  ('Super Admin', 'super_admin', 'Full system access – Vivacity internal', 1),
  ('Team Leader', 'team_leader', 'Vivacity team leadership role', 2),
  ('Team Member', 'team_member', 'Vivacity staff execution role', 3),
  ('Admin', 'admin', 'Client organisation administrator', 4),
  ('User', 'user', 'Client general user', 5);
