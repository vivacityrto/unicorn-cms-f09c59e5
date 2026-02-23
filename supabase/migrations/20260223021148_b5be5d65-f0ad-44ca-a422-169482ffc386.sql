
-- Issue 1: Fix user roles — sync role column from unicorn_role for Super Admins
UPDATE public.users
SET role = unicorn_role::text
WHERE unicorn_role::text IN ('Super Admin', 'Team Leader', 'Team Member')
  AND role != unicorn_role::text;

-- Issue 2: Create clickup_time_entries staging table
CREATE TABLE IF NOT EXISTS public.clickup_time_entries (
  id bigserial PRIMARY KEY,
  clickup_interval_id text NOT NULL UNIQUE,
  task_id text NOT NULL,
  tenant_id integer,
  user_name text,
  user_email text,
  duration_ms bigint NOT NULL DEFAULT 0,
  duration_minutes integer GENERATED ALWAYS AS ((duration_ms / 60000)::integer) STORED,
  start_at timestamptz,
  end_at timestamptz,
  description text,
  billable boolean DEFAULT false,
  imported_to_time_entries boolean DEFAULT false,
  imported_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_clickup_time_entries_task_id ON public.clickup_time_entries(task_id);
CREATE INDEX idx_clickup_time_entries_tenant_id ON public.clickup_time_entries(tenant_id);

ALTER TABLE public.clickup_time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity staff can read clickup time entries"
  ON public.clickup_time_entries FOR SELECT
  TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));
