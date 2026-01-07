-- Time Entries table for storing completed time records
CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_id integer NULL REFERENCES public.packages(id) ON DELETE SET NULL,
  stage_id integer NULL REFERENCES public.documents_stages(id) ON DELETE SET NULL,
  task_id uuid NULL,
  user_id uuid NOT NULL,
  work_type text NOT NULL DEFAULT 'general',
  is_billable boolean NOT NULL DEFAULT true,
  start_at timestamptz NULL,
  end_at timestamptz NULL,
  duration_minutes integer NOT NULL,
  notes text NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Active Timers table for tracking running timers
CREATE TABLE public.active_timers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_id integer NULL REFERENCES public.packages(id) ON DELETE SET NULL,
  stage_id integer NULL REFERENCES public.documents_stages(id) ON DELETE SET NULL,
  task_id uuid NULL,
  user_id uuid NOT NULL,
  work_type text NOT NULL DEFAULT 'general',
  start_at timestamptz NOT NULL DEFAULT now(),
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT active_timers_one_per_user UNIQUE (tenant_id, user_id)
);

-- Indexes for time_entries
CREATE INDEX idx_time_entries_tenant_client ON public.time_entries(tenant_id, client_id);
CREATE INDEX idx_time_entries_user ON public.time_entries(tenant_id, user_id);
CREATE INDEX idx_time_entries_date ON public.time_entries(tenant_id, client_id, start_at DESC);

-- Indexes for active_timers
CREATE INDEX idx_active_timers_user ON public.active_timers(tenant_id, user_id);

-- Enable RLS
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_timers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for time_entries - use connected_tenants for membership check
CREATE POLICY "time_entries_select" ON public.time_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.connected_tenants ct
      WHERE ct.tenant_id = time_entries.tenant_id
      AND ct.user_uuid = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
      AND u.role = 'SuperAdmin'
    )
  );

CREATE POLICY "time_entries_insert" ON public.time_entries
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.connected_tenants ct
        WHERE ct.tenant_id = time_entries.tenant_id
        AND ct.user_uuid = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_uuid = auth.uid()
        AND u.role = 'SuperAdmin'
      )
    )
  );

CREATE POLICY "time_entries_update" ON public.time_entries
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
      AND u.role = 'SuperAdmin'
    )
  );

CREATE POLICY "time_entries_delete" ON public.time_entries
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
      AND u.role = 'SuperAdmin'
    )
  );

-- RLS Policies for active_timers
CREATE POLICY "active_timers_select" ON public.active_timers
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
      AND u.role = 'SuperAdmin'
    )
  );

CREATE POLICY "active_timers_insert" ON public.active_timers
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "active_timers_update" ON public.active_timers
  FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "active_timers_delete" ON public.active_timers
  FOR DELETE
  USING (user_id = auth.uid());

-- RPC: Start Timer
CREATE OR REPLACE FUNCTION public.rpc_start_timer(
  p_tenant_id integer,
  p_client_id integer,
  p_package_id integer DEFAULT NULL,
  p_stage_id integer DEFAULT NULL,
  p_task_id uuid DEFAULT NULL,
  p_work_type text DEFAULT 'general',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_existing_timer public.active_timers%ROWTYPE;
  v_new_timer public.active_timers%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  
  -- Check for existing timer for this user (any tenant)
  SELECT * INTO v_existing_timer
  FROM public.active_timers at
  WHERE at.user_id = v_user_id;
  
  IF v_existing_timer.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'timer_already_running',
      'existing_timer', jsonb_build_object(
        'id', v_existing_timer.id,
        'client_id', v_existing_timer.client_id,
        'start_at', v_existing_timer.start_at
      )
    );
  END IF;
  
  -- Insert new timer
  INSERT INTO public.active_timers (tenant_id, client_id, package_id, stage_id, task_id, user_id, work_type, notes)
  VALUES (p_tenant_id, p_client_id, p_package_id, p_stage_id, p_task_id, v_user_id, p_work_type, p_notes)
  RETURNING * INTO v_new_timer;
  
  RETURN jsonb_build_object(
    'success', true,
    'timer', jsonb_build_object(
      'id', v_new_timer.id,
      'client_id', v_new_timer.client_id,
      'start_at', v_new_timer.start_at,
      'work_type', v_new_timer.work_type
    )
  );
END;
$$;

-- RPC: Stop Timer
CREATE OR REPLACE FUNCTION public.rpc_stop_timer()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_timer public.active_timers%ROWTYPE;
  v_duration_minutes integer;
  v_new_entry public.time_entries%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  
  -- Find active timer
  SELECT * INTO v_timer
  FROM public.active_timers at
  WHERE at.user_id = v_user_id;
  
  IF v_timer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_timer');
  END IF;
  
  -- Calculate duration
  v_duration_minutes := GREATEST(1, floor(extract(epoch from (now() - v_timer.start_at)) / 60)::integer);
  
  -- Insert time entry
  INSERT INTO public.time_entries (
    tenant_id, client_id, package_id, stage_id, task_id, user_id,
    work_type, is_billable, start_at, end_at, duration_minutes, notes, source
  )
  VALUES (
    v_timer.tenant_id, v_timer.client_id, v_timer.package_id, v_timer.stage_id, 
    v_timer.task_id, v_user_id, v_timer.work_type, true, v_timer.start_at, now(), 
    v_duration_minutes, v_timer.notes, 'timer'
  )
  RETURNING * INTO v_new_entry;
  
  -- Delete active timer
  DELETE FROM public.active_timers WHERE id = v_timer.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'time_entry', jsonb_build_object(
      'id', v_new_entry.id,
      'duration_minutes', v_new_entry.duration_minutes,
      'client_id', v_new_entry.client_id,
      'start_at', v_new_entry.start_at,
      'end_at', v_new_entry.end_at
    )
  );
END;
$$;

-- RPC: Add Manual Time Entry
CREATE OR REPLACE FUNCTION public.rpc_add_time_entry(
  p_tenant_id integer,
  p_client_id integer,
  p_duration_minutes integer,
  p_date date DEFAULT CURRENT_DATE,
  p_package_id integer DEFAULT NULL,
  p_stage_id integer DEFAULT NULL,
  p_task_id uuid DEFAULT NULL,
  p_work_type text DEFAULT 'general',
  p_notes text DEFAULT NULL,
  p_is_billable boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_new_entry public.time_entries%ROWTYPE;
  v_start_at timestamptz;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  
  -- Set start_at to midday of provided date for grouping
  v_start_at := (p_date::timestamp + interval '12 hours') AT TIME ZONE 'UTC';
  
  -- Insert time entry
  INSERT INTO public.time_entries (
    tenant_id, client_id, package_id, stage_id, task_id, user_id,
    work_type, is_billable, start_at, end_at, duration_minutes, notes, source
  )
  VALUES (
    p_tenant_id, p_client_id, p_package_id, p_stage_id, p_task_id, v_user_id,
    p_work_type, p_is_billable, v_start_at, NULL, p_duration_minutes, p_notes, 'manual'
  )
  RETURNING * INTO v_new_entry;
  
  RETURN jsonb_build_object(
    'success', true,
    'time_entry', jsonb_build_object(
      'id', v_new_entry.id,
      'duration_minutes', v_new_entry.duration_minutes,
      'client_id', v_new_entry.client_id
    )
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.rpc_start_timer TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_stop_timer TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_add_time_entry TO authenticated;