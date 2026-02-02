-- Fix: Remove ::text cast from entity_id in create_todos_from_issue RPC
-- The audit_eos_events.entity_id column is uuid, not text

CREATE OR REPLACE FUNCTION public.create_todos_from_issue(
  p_issue_id uuid,
  p_todos jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_todo jsonb;
  v_created_ids uuid[] := ARRAY[]::uuid[];
  v_new_id uuid;
  v_tenant_id integer;
  v_meeting_id uuid;
  v_user_id uuid;
BEGIN
  -- Get the current user
  v_user_id := auth.uid();
  
  -- Get tenant_id and meeting_id from the issue
  SELECT tenant_id, meeting_id INTO v_tenant_id, v_meeting_id
  FROM eos_issues
  WHERE id = p_issue_id;
  
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Issue not found: %', p_issue_id;
  END IF;
  
  -- Loop through each todo in the array
  FOR v_todo IN SELECT * FROM jsonb_array_elements(p_todos)
  LOOP
    INSERT INTO eos_todos (
      tenant_id,
      meeting_id,
      title,
      owner_id,
      assigned_to,
      due_date,
      status,
      created_by
    ) VALUES (
      v_tenant_id,
      v_meeting_id,
      v_todo->>'title',
      (v_todo->>'owner_id')::uuid,
      (v_todo->>'owner_id')::uuid,
      (v_todo->>'due_date')::date,
      'Open',
      v_user_id
    )
    RETURNING id INTO v_new_id;
    
    v_created_ids := array_append(v_created_ids, v_new_id);
  END LOOP;
  
  -- Create audit log entry (entity_id is uuid, no cast needed)
  INSERT INTO audit_eos_events (
    tenant_id,
    entity,
    entity_id,
    action,
    user_id,
    details
  ) VALUES (
    v_tenant_id,
    'todo',
    p_issue_id,
    'bulk_create',
    v_user_id,
    jsonb_build_object('count', array_length(v_created_ids, 1), 'from_issue', p_issue_id)
  );
  
  RETURN v_created_ids;
END;
$$;