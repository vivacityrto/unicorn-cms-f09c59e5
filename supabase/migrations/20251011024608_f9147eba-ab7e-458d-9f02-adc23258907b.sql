-- Phase 4: Issues (IDS) & Meeting Summary

-- Ensure eos_issues has all required fields
ALTER TABLE IF EXISTS eos_issues 
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS raised_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS linked_rock_id uuid REFERENCES eos_rocks(id),
  ADD COLUMN IF NOT EXISTS solved_at timestamptz,
  ADD COLUMN IF NOT EXISTS solution text;

-- Add indexes for eos_issues
CREATE INDEX IF NOT EXISTS idx_eos_issues_tenant_status_priority ON eos_issues(tenant_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_eos_issues_client_id ON eos_issues(client_id);
CREATE INDEX IF NOT EXISTS idx_eos_issues_linked_rock ON eos_issues(linked_rock_id);

-- Ensure eos_todos has all required fields
ALTER TABLE IF EXISTS eos_todos
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Create eos_meeting_summaries table
CREATE TABLE IF NOT EXISTS eos_meeting_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid UNIQUE NOT NULL REFERENCES eos_meetings(id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL,
  rating integer CHECK (rating >= 1 AND rating <= 10),
  attendance jsonb DEFAULT '[]'::jsonb,
  todos jsonb DEFAULT '[]'::jsonb,
  issues jsonb DEFAULT '[]'::jsonb,
  rocks jsonb DEFAULT '[]'::jsonb,
  headlines jsonb DEFAULT '[]'::jsonb,
  cascades jsonb DEFAULT '[]'::jsonb,
  emailed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS on eos_meeting_summaries
ALTER TABLE eos_meeting_summaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for eos_meeting_summaries
CREATE POLICY "Meeting participants can view summaries"
  ON eos_meeting_summaries
  FOR SELECT
  USING (
    is_super_admin() OR 
    is_meeting_participant(auth.uid(), meeting_id)
  );

CREATE POLICY "Facilitators can create summaries"
  ON eos_meeting_summaries
  FOR INSERT
  WITH CHECK (
    is_super_admin() OR
    has_meeting_role(auth.uid(), meeting_id, ARRAY['Leader'])
  );

-- RPC: Create issue from various sources
CREATE OR REPLACE FUNCTION create_issue(
  p_tenant_id bigint,
  p_source text,
  p_title text,
  p_description text DEFAULT NULL,
  p_priority text DEFAULT 'medium',
  p_client_id uuid DEFAULT NULL,
  p_linked_rock_id uuid DEFAULT NULL,
  p_meeting_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue_id uuid;
BEGIN
  -- Verify user has EOS access
  IF NOT (has_any_eos_role(auth.uid(), p_tenant_id) OR is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: EOS role required';
  END IF;

  -- Validate source
  IF p_source NOT IN ('scorecard', 'rock', 'headline', 'ad_hoc') THEN
    RAISE EXCEPTION 'Invalid source: must be scorecard, rock, headline, or ad_hoc';
  END IF;

  -- Create issue
  INSERT INTO eos_issues (
    tenant_id,
    client_id,
    title,
    description,
    priority,
    status,
    raised_by,
    linked_rock_id,
    meeting_id,
    created_by
  ) VALUES (
    p_tenant_id,
    p_client_id,
    p_title,
    p_description,
    p_priority,
    'Open',
    auth.uid(),
    p_linked_rock_id,
    p_meeting_id,
    auth.uid()
  ) RETURNING id INTO v_issue_id;

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
    p_tenant_id,
    auth.uid(),
    p_meeting_id,
    'issue',
    v_issue_id,
    'created',
    'Issue created from ' || p_source,
    jsonb_build_object(
      'source', p_source,
      'priority', p_priority
    )
  );

  RETURN v_issue_id;
END;
$$;

-- RPC: Set issue status (facilitator only)
CREATE OR REPLACE FUNCTION set_issue_status(
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
    is_eos_admin(auth.uid(), v_issue.tenant_id) OR
    (v_issue.meeting_id IS NOT NULL AND has_meeting_role(auth.uid(), v_issue.meeting_id, ARRAY['Leader']))
  ) THEN
    RAISE EXCEPTION 'Only facilitator or admin can change issue status';
  END IF;

  -- Update issue
  UPDATE eos_issues
  SET 
    status = p_status,
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

-- RPC: Create to-dos from issue solution
CREATE OR REPLACE FUNCTION create_todos_from_issue(
  p_issue_id uuid,
  p_todos jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue RECORD;
  v_todo jsonb;
  v_todo_id uuid;
  v_todo_ids uuid[] := '{}';
BEGIN
  -- Get issue
  SELECT * INTO v_issue
  FROM eos_issues
  WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue not found';
  END IF;

  -- Verify permissions
  IF NOT (
    is_super_admin() OR 
    is_eos_admin(auth.uid(), v_issue.tenant_id) OR
    (v_issue.meeting_id IS NOT NULL AND has_meeting_role(auth.uid(), v_issue.meeting_id, ARRAY['Leader', 'Member']))
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Create each todo
  FOR v_todo IN SELECT * FROM jsonb_array_elements(p_todos)
  LOOP
    INSERT INTO eos_todos (
      tenant_id,
      client_id,
      meeting_id,
      title,
      description,
      owner_id,
      assigned_to,
      due_date,
      status,
      created_by
    ) VALUES (
      v_issue.tenant_id,
      v_issue.client_id,
      v_issue.meeting_id,
      v_todo->>'title',
      'From issue: ' || v_issue.title,
      v_todo->>'owner_id',
      v_todo->>'owner_id',
      (v_todo->>'due_date')::date,
      'Open',
      auth.uid()
    ) RETURNING id INTO v_todo_id;

    v_todo_ids := array_append(v_todo_ids, v_todo_id);
  END LOOP;

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
    'todos_created',
    'To-dos created from issue solution',
    jsonb_build_object(
      'todo_count', array_length(v_todo_ids, 1),
      'todo_ids', v_todo_ids
    )
  );

  RETURN v_todo_ids;
END;
$$;

-- RPC: Generate meeting summary
CREATE OR REPLACE FUNCTION generate_meeting_summary(
  p_meeting_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_summary_id uuid;
  v_todos jsonb;
  v_issues jsonb;
  v_rocks jsonb;
  v_headlines jsonb;
  v_participants jsonb;
BEGIN
  -- Get meeting
  SELECT * INTO v_meeting
  FROM eos_meetings
  WHERE id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  -- Verify permissions (facilitator only)
  IF NOT (
    is_super_admin() OR
    has_meeting_role(auth.uid(), p_meeting_id, ARRAY['Leader'])
  ) THEN
    RAISE EXCEPTION 'Only facilitator can generate summary';
  END IF;

  -- Check if summary already exists (idempotent)
  SELECT id INTO v_summary_id
  FROM eos_meeting_summaries
  WHERE meeting_id = p_meeting_id;

  IF v_summary_id IS NOT NULL THEN
    RETURN v_summary_id;
  END IF;

  -- Aggregate to-dos
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'title', title,
      'owner_id', owner_id,
      'due_date', due_date,
      'status', status,
      'completed_at', completed_at
    )
  ) INTO v_todos
  FROM eos_todos
  WHERE meeting_id = p_meeting_id;

  -- Aggregate issues
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'title', title,
      'status', status,
      'priority', priority,
      'solution', solution,
      'solved_at', solved_at
    )
  ) INTO v_issues
  FROM eos_issues
  WHERE meeting_id = p_meeting_id;

  -- Aggregate headlines
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'headline', headline,
      'is_good_news', is_good_news,
      'user_id', user_id
    )
  ) INTO v_headlines
  FROM eos_headlines
  WHERE meeting_id = p_meeting_id;

  -- Aggregate participants
  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id', user_id,
      'role', role,
      'attended', attended
    )
  ) INTO v_participants
  FROM eos_meeting_participants
  WHERE meeting_id = p_meeting_id;

  -- Create summary
  INSERT INTO eos_meeting_summaries (
    meeting_id,
    tenant_id,
    todos,
    issues,
    headlines,
    attendance,
    rocks,
    cascades
  ) VALUES (
    p_meeting_id,
    v_meeting.tenant_id,
    COALESCE(v_todos, '[]'::jsonb),
    COALESCE(v_issues, '[]'::jsonb),
    COALESCE(v_headlines, '[]'::jsonb),
    COALESCE(v_participants, '[]'::jsonb),
    '[]'::jsonb,
    '[]'::jsonb
  ) RETURNING id INTO v_summary_id;

  -- Mark meeting as complete
  UPDATE eos_meetings
  SET is_complete = true, completed_at = now()
  WHERE id = p_meeting_id;

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
    v_meeting.tenant_id,
    auth.uid(),
    p_meeting_id,
    'summary',
    v_summary_id,
    'created',
    'Meeting summary generated',
    jsonb_build_object(
      'todo_count', jsonb_array_length(COALESCE(v_todos, '[]'::jsonb)),
      'issue_count', jsonb_array_length(COALESCE(v_issues, '[]'::jsonb))
    )
  );

  RETURN v_summary_id;
END;
$$;