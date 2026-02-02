-- Fix set_issue_status RPC to properly cast text to eos_issue_status enum
CREATE OR REPLACE FUNCTION public.set_issue_status(
  p_issue_id UUID,
  p_status TEXT,
  p_solution_text TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue RECORD;
BEGIN
  -- Get issue and verify meeting role
  SELECT i.*, m.id as meeting_id INTO v_issue
  FROM eos_issues i
  LEFT JOIN eos_meetings m ON m.id = i.meeting_id
  WHERE i.id = p_issue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue not found';
  END IF;

  -- Only facilitator or admin can change status
  IF NOT (
    is_super_admin() OR 
    is_staff() OR
    is_eos_admin(auth.uid(), v_issue.tenant_id) OR
    (v_issue.meeting_id IS NOT NULL AND has_meeting_role(auth.uid(), v_issue.meeting_id, ARRAY['Leader']))
  ) THEN
    RAISE EXCEPTION 'Only facilitator or admin can change issue status';
  END IF;

  -- Update issue - cast text to enum
  UPDATE eos_issues
  SET 
    status = p_status::eos_issue_status,
    solved_at = CASE WHEN p_status = 'Solved' THEN now() ELSE NULL END,
    solution = CASE WHEN p_status = 'Solved' THEN p_solution_text ELSE solution END,
    updated_at = now()
  WHERE id = p_issue_id;

  -- Audit log
  INSERT INTO audit_eos_events (
    tenant_id,
    user_id,
    meeting_id,
    entity,
    entity_id,
    action,
    reason,
    details
  ) VALUES (
    v_issue.tenant_id,
    auth.uid(),
    v_issue.meeting_id,
    'issue',
    p_issue_id,
    'status_changed',
    'Issue status changed to ' || p_status,
    jsonb_build_object(
      'new_status', p_status,
      'solution', p_solution_text
    )
  );
END;
$$;