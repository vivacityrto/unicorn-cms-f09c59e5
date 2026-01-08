-- Add new fields to calendar_time_drafts
ALTER TABLE public.calendar_time_drafts
ADD COLUMN IF NOT EXISTS work_type text NULL,
ADD COLUMN IF NOT EXISTS is_billable boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS snoozed_until date NULL;

-- Create index for draft queries
CREATE INDEX IF NOT EXISTS idx_calendar_time_drafts_status_created 
ON public.calendar_time_drafts(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calendar_time_drafts_created_by_status 
ON public.calendar_time_drafts(created_by, status);

-- RPC: List time drafts with filters
CREATE OR REPLACE FUNCTION public.rpc_list_time_drafts(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_status text DEFAULT 'draft'
)
RETURNS TABLE (
  id uuid,
  tenant_id bigint,
  created_by uuid,
  calendar_event_id uuid,
  client_id bigint,
  package_id bigint,
  stage_id bigint,
  minutes integer,
  work_date date,
  notes text,
  confidence numeric,
  suggestion jsonb,
  status text,
  work_type text,
  is_billable boolean,
  last_viewed_at timestamptz,
  snoozed_until date,
  created_at timestamptz,
  updated_at timestamptz,
  event_title text,
  event_start_at timestamptz,
  event_end_at timestamptz,
  client_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.tenant_id,
    d.created_by,
    d.calendar_event_id,
    d.client_id,
    d.package_id,
    d.stage_id,
    d.minutes,
    d.work_date,
    d.notes,
    d.confidence,
    d.suggestion,
    d.status,
    d.work_type,
    d.is_billable,
    d.last_viewed_at,
    d.snoozed_until,
    d.created_at,
    d.updated_at,
    ce.title AS event_title,
    ce.start_at AS event_start_at,
    ce.end_at AS event_end_at,
    t.name AS client_name
  FROM public.calendar_time_drafts d
  LEFT JOIN public.calendar_events ce ON ce.id = d.calendar_event_id
  LEFT JOIN public.tenants t ON t.id = d.client_id
  WHERE d.created_by = auth.uid()
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_from IS NULL OR d.work_date >= p_from)
    AND (p_to IS NULL OR d.work_date <= p_to)
    AND (d.snoozed_until IS NULL OR d.snoozed_until <= CURRENT_DATE)
  ORDER BY d.work_date DESC, d.created_at DESC;
END;
$$;

-- RPC: Update time draft
CREATE OR REPLACE FUNCTION public.rpc_update_time_draft(
  p_draft_id uuid,
  p_fields jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft record;
  v_update_sql text;
  v_allowed_fields text[] := ARRAY['client_id', 'package_id', 'stage_id', 'minutes', 'work_date', 'notes', 'work_type', 'is_billable', 'snoozed_until'];
  v_field text;
  v_value text;
  v_set_clauses text[] := ARRAY[]::text[];
BEGIN
  -- Check draft exists and belongs to user
  SELECT * INTO v_draft
  FROM public.calendar_time_drafts
  WHERE id = p_draft_id AND created_by = auth.uid();
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft not found or access denied');
  END IF;
  
  IF v_draft.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot update a non-draft entry');
  END IF;

  -- Build dynamic update
  FOR v_field IN SELECT jsonb_object_keys(p_fields)
  LOOP
    IF v_field = ANY(v_allowed_fields) THEN
      v_set_clauses := array_append(v_set_clauses, format('%I = %L', v_field, p_fields->>v_field));
    END IF;
  END LOOP;

  IF array_length(v_set_clauses, 1) > 0 THEN
    v_update_sql := format(
      'UPDATE public.calendar_time_drafts SET %s, updated_at = now() WHERE id = %L',
      array_to_string(v_set_clauses, ', '),
      p_draft_id
    );
    EXECUTE v_update_sql;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- RPC: Bulk post time drafts
CREATE OR REPLACE FUNCTION public.rpc_bulk_post_time_drafts(p_draft_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft record;
  v_posted_count int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_time_entry_id uuid;
BEGIN
  FOR v_draft IN (
    SELECT d.*, t.name as client_name
    FROM public.calendar_time_drafts d
    LEFT JOIN public.tenants t ON t.id = d.client_id
    WHERE d.id = ANY(p_draft_ids)
      AND d.created_by = auth.uid()
      AND d.status = 'draft'
  )
  LOOP
    -- Validate required fields
    IF v_draft.client_id IS NULL THEN
      v_errors := v_errors || jsonb_build_object('draft_id', v_draft.id, 'error', 'Client is required');
      CONTINUE;
    END IF;
    
    IF v_draft.minutes IS NULL OR v_draft.minutes <= 0 THEN
      v_errors := v_errors || jsonb_build_object('draft_id', v_draft.id, 'error', 'Minutes must be greater than 0');
      CONTINUE;
    END IF;

    -- Insert into time_entries
    INSERT INTO public.time_entries (
      tenant_id,
      client_id,
      user_id,
      package_id,
      stage_id,
      work_date,
      minutes,
      work_type,
      is_billable,
      notes,
      source,
      source_id,
      created_by
    ) VALUES (
      v_draft.tenant_id,
      v_draft.client_id,
      v_draft.created_by,
      v_draft.package_id,
      v_draft.stage_id,
      v_draft.work_date,
      v_draft.minutes,
      COALESCE(v_draft.work_type, 'meeting'),
      COALESCE(v_draft.is_billable, true),
      v_draft.notes,
      'calendar',
      v_draft.calendar_event_id::text,
      v_draft.created_by
    )
    RETURNING id INTO v_time_entry_id;

    -- Update draft to posted
    UPDATE public.calendar_time_drafts
    SET status = 'posted',
        posted_time_entry_id = v_time_entry_id,
        updated_at = now()
    WHERE id = v_draft.id;

    v_posted_count := v_posted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'posted_count', v_posted_count,
    'errors', v_errors
  );
END;
$$;

-- RPC: Bulk discard time drafts
CREATE OR REPLACE FUNCTION public.rpc_bulk_discard_time_drafts(p_draft_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_discarded_count int;
BEGIN
  UPDATE public.calendar_time_drafts
  SET status = 'discarded',
      updated_at = now()
  WHERE id = ANY(p_draft_ids)
    AND created_by = auth.uid()
    AND status = 'draft';
  
  GET DIAGNOSTICS v_discarded_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'discarded_count', v_discarded_count
  );
END;
$$;

-- RPC: Get time inbox stats (for dashboard widget)
CREATE OR REPLACE FUNCTION public.rpc_get_time_inbox_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_count int;
  v_overdue_count int;
BEGIN
  -- Count drafts from last 2 days
  SELECT COUNT(*) INTO v_recent_count
  FROM public.calendar_time_drafts
  WHERE created_by = auth.uid()
    AND status = 'draft'
    AND work_date >= CURRENT_DATE - interval '2 days';

  -- Count overdue drafts (older than 2 days)
  SELECT COUNT(*) INTO v_overdue_count
  FROM public.calendar_time_drafts
  WHERE created_by = auth.uid()
    AND status = 'draft'
    AND work_date < CURRENT_DATE - interval '2 days';

  RETURN jsonb_build_object(
    'recent_count', v_recent_count,
    'overdue_count', v_overdue_count,
    'total_drafts', v_recent_count + v_overdue_count
  );
END;
$$;