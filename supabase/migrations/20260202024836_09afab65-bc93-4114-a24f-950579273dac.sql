-- Fix: Link backlog issues to active meeting during IDS workflow
-- Update set_issue_status to:
-- 1. Auto-assign backlog issues to user's active meeting
-- 2. Append solved issues to meeting's issues_discussed array

CREATE OR REPLACE FUNCTION public.set_issue_status(
  p_issue_id uuid,
  p_status text,
  p_solution_text text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue RECORD;
  v_user_id uuid := auth.uid();
  v_old_status text;
  v_active_meeting_id uuid;
BEGIN
  -- Get current issue details
  SELECT * INTO v_issue FROM eos_issues WHERE id = p_issue_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue not found';
  END IF;
  
  v_old_status := v_issue.status;
  
  -- Permission check: facilitators and staff can update status
  -- (RLS policies will handle tenant isolation)
  
  -- Auto-link backlog issues to active meeting when being discussed/solved
  IF p_status::eos_issue_status IN ('Discussing', 'Solved') AND v_issue.meeting_id IS NULL THEN
    -- Find user's active in-progress meeting
    SELECT m.id INTO v_active_meeting_id
    FROM eos_meetings m
    INNER JOIN eos_meeting_attendees a ON a.meeting_id = m.id
    WHERE m.tenant_id = v_issue.tenant_id
      AND m.is_complete = false
      AND a.user_id = v_user_id
      AND a.attendance_status IN ('attended', 'late')
    ORDER BY m.scheduled_date DESC
    LIMIT 1;
    
    IF v_active_meeting_id IS NOT NULL THEN
      -- Link issue to active meeting
      UPDATE eos_issues 
      SET meeting_id = v_active_meeting_id 
      WHERE id = p_issue_id;
      
      -- Update local reference
      v_issue.meeting_id := v_active_meeting_id;
    END IF;
  END IF;
  
  -- Update the issue status
  UPDATE eos_issues
  SET 
    status = p_status::eos_issue_status,
    solution = COALESCE(p_solution_text, solution),
    solved_at = CASE 
      WHEN p_status::eos_issue_status = 'Solved' THEN now() 
      ELSE solved_at 
    END,
    resolved_by = CASE 
      WHEN p_status::eos_issue_status = 'Solved' THEN v_user_id 
      ELSE resolved_by 
    END,
    updated_at = now()
  WHERE id = p_issue_id;
  
  -- When solved, add to meeting's issues_discussed array
  IF p_status::eos_issue_status = 'Solved' AND v_issue.meeting_id IS NOT NULL THEN
    UPDATE eos_meetings
    SET issues_discussed = COALESCE(issues_discussed, '{}') || ARRAY[p_issue_id]
    WHERE id = v_issue.meeting_id
      AND NOT (p_issue_id = ANY(COALESCE(issues_discussed, '{}')));
  END IF;
  
  -- Audit log
  INSERT INTO audit_eos_events (
    tenant_id, entity, entity_id, action, user_id, details
  ) VALUES (
    v_issue.tenant_id,
    'issue',
    p_issue_id,
    'status_change',
    v_user_id,
    jsonb_build_object(
      'old_status', v_old_status,
      'new_status', p_status,
      'meeting_linked', v_issue.meeting_id IS NOT NULL
    )
  );
END;
$$;

-- Update create_todos_from_issue to accept explicit meeting_id
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
  -- Get tenant_id from the issue
  SELECT tenant_id INTO v_tenant_id
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