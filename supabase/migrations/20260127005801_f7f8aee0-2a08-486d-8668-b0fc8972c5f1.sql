-- Fix create_issue RPC to use 'identified' status (valid enum value) instead of 'open'
CREATE OR REPLACE FUNCTION public.create_issue(
  p_tenant_id BIGINT,
  p_source TEXT DEFAULT 'ad_hoc',
  p_title TEXT DEFAULT '',
  p_description TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'medium',
  p_client_id UUID DEFAULT NULL,
  p_linked_rock_id UUID DEFAULT NULL,
  p_meeting_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue_id UUID;
  v_priority_int INTEGER;
BEGIN
  -- Convert text priority to integer (high=3, medium=2, low=1)
  v_priority_int := CASE LOWER(p_priority)
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    ELSE 2
  END;

  -- Insert issue with 'identified' as initial status (valid eos_issue_status enum value)
  INSERT INTO eos_issues (
    tenant_id, client_id, title, description, priority, status,
    raised_by, linked_rock_id, meeting_id, created_by
  ) VALUES (
    p_tenant_id, p_client_id, p_title, p_description, v_priority_int, 'identified',
    auth.uid(), p_linked_rock_id, p_meeting_id, auth.uid()
  )
  RETURNING id INTO v_issue_id;

  -- Audit log entry
  INSERT INTO audit_eos_events (
    tenant_id, user_id, meeting_id, entity, entity_id, action, reason, details
  ) VALUES (
    p_tenant_id, auth.uid(), p_meeting_id, 'issue', v_issue_id, 'created',
    'Issue created from ' || p_source,
    jsonb_build_object('source', p_source, 'priority', p_priority)
  );

  RETURN v_issue_id;
END;
$$;