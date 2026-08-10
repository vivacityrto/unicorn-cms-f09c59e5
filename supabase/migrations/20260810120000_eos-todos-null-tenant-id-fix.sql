-- Fix: "Mark as Solved" with attached to-dos fails with
-- "null value in column tenant_id of relation eos_todos violates not-null constraint"
--
-- Root cause: eos_issues.tenant_id was left NULL on issues created via
-- several UI paths (createIssue in useEos.tsx has no tenant fallback, unlike
-- createTodo/createRock/createMeeting in the same file). create_todos_from_issue
-- then copies that NULL straight into eos_todos.tenant_id, which is NOT NULL.
--
-- EOS/L10 is Vivacity-internal only: every eos_issues row today is either
-- tenant_id = 6372 or NULL (verified live, no other tenant present), so
-- backfilling NULLs to 6372 is a safe, non-lossy data fix.

UPDATE eos_issues SET tenant_id = 6372 WHERE tenant_id IS NULL;

CREATE OR REPLACE FUNCTION public.create_todos_from_issue(
  p_issue_id uuid,
  p_todos jsonb,
  p_meeting_id uuid DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_todo jsonb;
  v_created_ids uuid[] := '{}';
  v_new_id uuid;
  v_tenant_id integer;
  v_meeting_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  -- Get tenant_id from the issue, falling back to Vivacity's internal
  -- tenant (6372) if the issue predates the tenant_id backfill above.
  SELECT COALESCE(tenant_id, 6372) INTO v_tenant_id
  FROM eos_issues WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue not found';
  END IF;

  -- Use explicit meeting_id if provided, otherwise get from issue
  IF p_meeting_id IS NOT NULL THEN
    v_meeting_id := p_meeting_id;
  ELSE
    SELECT meeting_id INTO v_meeting_id FROM eos_issues WHERE id = p_issue_id;
  END IF;

  -- Create each to-do
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

    v_created_ids := v_created_ids || v_new_id;
  END LOOP;

  -- Audit log
  INSERT INTO audit_eos_events (
    tenant_id, entity, entity_id, action, user_id, details
  ) VALUES (
    v_tenant_id,
    'todo',
    p_issue_id,
    'bulk_create',
    v_user_id,
    jsonb_build_object(
      'count', array_length(v_created_ids, 1),
      'from_issue', p_issue_id,
      'meeting_id', v_meeting_id
    )
  );

  RETURN v_created_ids;
END;
$$;
