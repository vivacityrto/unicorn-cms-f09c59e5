-- ============================================
-- Create dd_priority lookup table
-- ============================================
CREATE TABLE IF NOT EXISTS public.dd_priority (
  code integer PRIMARY KEY,
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.dd_priority ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read dd_priority"
  ON public.dd_priority FOR SELECT TO authenticated USING (true);

INSERT INTO public.dd_priority (code, value, label, sort_order, is_active) VALUES
  (1, 'low',    'Low',    1, true),
  (2, 'normal', 'Normal', 2, true),
  (3, 'medium', 'Medium', 3, true),
  (4, 'high',   'High',   4, true),
  (5, 'urgent', 'Urgent', 5, true);

-- ============================================
-- Create dd_action_status lookup table
-- ============================================
CREATE TABLE IF NOT EXISTS public.dd_action_status (
  code integer PRIMARY KEY,
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.dd_action_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read dd_action_status"
  ON public.dd_action_status FOR SELECT TO authenticated USING (true);

INSERT INTO public.dd_action_status (code, value, label, sort_order, is_active) VALUES
  (1, 'open',           'Open',              1, true),
  (2, 'in_progress',    'In Progress',       2, true),
  (3, 'blocked',        'Blocked',           3, true),
  (4, 'waiting_client', 'Waiting on Client', 4, true),
  (5, 'done',           'Done',              5, true),
  (6, 'cancelled',      'Cancelled',         6, true),
  (7, 'todo',           'To Do',             0, true);

-- ============================================
-- Drop ALL conflicting CHECK constraints on client_action_items
-- ============================================
ALTER TABLE public.client_action_items DROP CONSTRAINT IF EXISTS chk_priority;
ALTER TABLE public.client_action_items DROP CONSTRAINT IF EXISTS client_action_items_priority_check;
ALTER TABLE public.client_action_items DROP CONSTRAINT IF EXISTS chk_status;
ALTER TABLE public.client_action_items DROP CONSTRAINT IF EXISTS client_action_items_status_check;

-- ============================================
-- Create validation trigger instead of CHECK (subqueries not allowed in CHECK)
-- ============================================
CREATE OR REPLACE FUNCTION public.trg_validate_action_item_priority_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validate priority against dd_priority
  IF NEW.priority IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.dd_priority WHERE value = NEW.priority AND is_active = true) THEN
      RAISE EXCEPTION 'Invalid priority: %. Must be one of the values in dd_priority.', NEW.priority;
    END IF;
  END IF;

  -- Validate status against dd_action_status
  IF NEW.status IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.dd_action_status WHERE value = NEW.status AND is_active = true) THEN
      RAISE EXCEPTION 'Invalid status: %. Must be one of the values in dd_action_status.', NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_action_item_priority_status
  BEFORE INSERT OR UPDATE ON public.client_action_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_validate_action_item_priority_status();

-- ============================================
-- Update column default
-- ============================================
ALTER TABLE public.client_action_items ALTER COLUMN priority SET DEFAULT 'medium';

-- ============================================
-- Update source check to include task_assignment
-- ============================================
ALTER TABLE public.client_action_items DROP CONSTRAINT IF EXISTS client_action_items_source_check;
ALTER TABLE public.client_action_items
  ADD CONSTRAINT client_action_items_source_check CHECK (
    source IN ('manual', 'note', 'stage_rule', 'system', 'task_assignment')
  );

-- ============================================
-- Update RPC to validate against lookup tables
-- ============================================
CREATE OR REPLACE FUNCTION public.rpc_create_action_item(
  p_tenant_id integer,
  p_client_id text,
  p_title text,
  p_description text DEFAULT NULL,
  p_owner_user_id uuid DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_priority text DEFAULT 'medium',
  p_source text DEFAULT 'manual',
  p_source_note_id uuid DEFAULT NULL,
  p_related_entity_type text DEFAULT NULL,
  p_related_entity_id text DEFAULT NULL,
  p_recurrence_rule text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_action_id uuid;
  v_user_name text;
  v_owner_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_title IS NULL OR trim(p_title) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Title is required');
  END IF;

  -- Validate priority against dd_priority lookup table
  IF NOT EXISTS (SELECT 1 FROM public.dd_priority WHERE value = p_priority AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid priority');
  END IF;

  -- Validate source
  IF p_source NOT IN ('manual', 'note', 'stage_rule', 'system', 'task_assignment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid source');
  END IF;

  SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_user_name
  FROM public.users WHERE user_uuid = v_user_id;

  IF p_owner_user_id IS NOT NULL THEN
    SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_owner_name
    FROM public.users WHERE user_uuid = p_owner_user_id;
  END IF;

  INSERT INTO public.client_action_items (
    tenant_id, client_id, created_by, title, description, owner_user_id,
    due_date, priority, source, source_note_id, related_entity_type,
    related_entity_id, recurrence_rule
  ) VALUES (
    p_tenant_id, p_client_id, v_user_id, p_title, p_description, p_owner_user_id,
    p_due_date, p_priority, p_source, p_source_note_id, p_related_entity_type,
    p_related_entity_id, p_recurrence_rule
  )
  RETURNING id INTO v_action_id;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, created_by, source, event_type, title, body,
    entity_type, entity_id, metadata
  ) VALUES (
    p_tenant_id, p_client_id, v_user_id, 'user', 'action_item_created',
    p_title, p_description, 'action_item', v_action_id::text,
    jsonb_build_object(
      'priority', p_priority,
      'due_date', p_due_date,
      'owner_name', v_owner_name,
      'created_by_name', v_user_name,
      'source', p_source
    )
  );

  RETURN jsonb_build_object('success', true, 'action_item_id', v_action_id);
END;
$$;