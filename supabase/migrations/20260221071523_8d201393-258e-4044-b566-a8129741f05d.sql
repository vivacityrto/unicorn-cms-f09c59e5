
-- Create the unified clickup_tasks_api table
CREATE TABLE public.clickup_tasks_api (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id text NOT NULL UNIQUE,
  custom_id text,
  name text,
  description text,
  text_content text,
  status text,
  priority text,
  parent_task_id text,
  date_created bigint,
  date_updated bigint,
  date_closed bigint,
  date_done bigint,
  due_date bigint,
  start_date bigint,
  time_estimate bigint,
  time_spent bigint,
  assignees jsonb,
  watchers jsonb,
  tags jsonb,
  checklists jsonb,
  list_id text,
  list_name text,
  folder_id text,
  folder_name text,
  space_id text,
  space_name text,
  url text,
  creator_id bigint,
  creator_username text,
  custom_fields jsonb,
  -- Flattened custom field columns
  unicorn_url text,
  sharepoint_url text,
  mb_level text,
  risk text,
  rto_id text,
  phone text,
  email_address text,
  audit_date text,
  mock_audit text,
  cricos_rereg_date text,
  registration_date text,
  re_reg_due_date text,
  submission_date text,
  working_hours text,
  notes text,
  infusionsoft_url text,
  date_of_last_contact text,
  date_of_last_systemscheck text,
  client_meeting_attendance text,
  time_with_vivacity text,
  registered_spr text,
  on_hold_start_date text,
  on_hold_end_date text,
  -- Derived columns
  tenant_id integer REFERENCES public.tenants(id),
  raw_json jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_clickup_tasks_api_tenant_id ON public.clickup_tasks_api(tenant_id);
CREATE INDEX idx_clickup_tasks_api_status ON public.clickup_tasks_api(status);
CREATE INDEX idx_clickup_tasks_api_fetched_at ON public.clickup_tasks_api(fetched_at);

-- Enable RLS
ALTER TABLE public.clickup_tasks_api ENABLE ROW LEVEL SECURITY;

-- Staff-only access (matching existing clickup tables)
CREATE POLICY "Staff can view clickup_tasks_api"
  ON public.clickup_tasks_api
  FOR SELECT
  TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

CREATE POLICY "Staff can insert clickup_tasks_api"
  ON public.clickup_tasks_api
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vivacity_staff(auth.uid()));

CREATE POLICY "Staff can update clickup_tasks_api"
  ON public.clickup_tasks_api
  FOR UPDATE
  TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

CREATE POLICY "Staff can delete clickup_tasks_api"
  ON public.clickup_tasks_api
  FOR DELETE
  TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

-- Service role bypass for edge functions
CREATE POLICY "Service role full access clickup_tasks_api"
  ON public.clickup_tasks_api
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
