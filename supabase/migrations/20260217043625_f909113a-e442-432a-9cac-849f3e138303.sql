CREATE OR REPLACE FUNCTION public.rpc_update_time_draft(p_draft_id uuid, p_fields jsonb)
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
  v_set_clauses text[] := '{}';
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
      -- Handle null values properly with IS NULL
      IF p_fields->v_field = 'null'::jsonb OR p_fields->>v_field IS NULL THEN
        v_set_clauses := array_append(v_set_clauses, format('%I = NULL', v_field));
      ELSE
        v_set_clauses := array_append(v_set_clauses, format('%I = %L', v_field, p_fields->>v_field));
      END IF;
    END IF;
  END LOOP;

  IF cardinality(v_set_clauses) > 0 THEN
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