-- Fix: Cast JSONB text values to UUID in create_todos_from_issue
-- This fixes: "column 'owner_id' is of type uuid but expression is of type text"

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
  v_user_id uuid;
  v_tenant_id bigint;
  v_meeting_id uuid;
  v_todo jsonb;
  v_created_ids uuid[] := '{}';
  v_new_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get issue details
  SELECT tenant_id, meeting_id INTO v_tenant_id, v_meeting_id
  FROM eos_issues
  WHERE id = p_issue_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Issue not found';
  END IF;

  -- Process each todo
  FOR v_todo IN SELECT * FROM jsonb_array_elements(p_todos)
  LOOP
    INSERT INTO eos_todos (
      tenant_id,
      meeting_id,
      issue_id,
      title,
      owner_id,
      assigned_to,
      due_date,
      status,
      created_by
    ) VALUES (
      v_tenant_id,
      v_meeting_id,
      p_issue_id,
      v_todo->>'title',
      (v_todo->>'owner_id')::uuid,
      (v_todo->>'owner_id')::uuid,
      (v_todo->>'due_date')::date,
      'pending',
      v_user_id
    )
    RETURNING id INTO v_new_id;

    v_created_ids := array_append(v_created_ids, v_new_id);
  END LOOP;

  -- Log audit event
  INSERT INTO audit_eos_events (
    tenant_id,
    user_id,
    entity,
    entity_id,
    action,
    meeting_id,
    details
  ) VALUES (
    v_tenant_id,
    v_user_id,
    'todo',
    p_issue_id::text,
    'batch_create',
    v_meeting_id,
    jsonb_build_object('count', array_length(v_created_ids, 1), 'from_issue', p_issue_id)
  );

  RETURN v_created_ids;
END;
$$;