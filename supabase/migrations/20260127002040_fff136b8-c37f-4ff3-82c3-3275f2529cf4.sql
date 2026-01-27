-- Reset meeting segments for fresh start
UPDATE eos_meeting_segments 
SET started_at = NULL, completed_at = NULL
WHERE meeting_id = '64a80954-66e0-40b6-b595-0fa68a1ec4bb';

-- Create go_to_previous_segment RPC
CREATE OR REPLACE FUNCTION public.go_to_previous_segment(p_meeting_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_segment RECORD;
  v_previous_segment RECORD;
  v_meeting RECORD;
BEGIN
  -- Verify facilitator permissions
  SELECT m.*, emp.role INTO v_meeting
  FROM public.eos_meetings m
  LEFT JOIN public.eos_meeting_participants emp 
    ON emp.meeting_id = m.id AND emp.user_id = auth.uid()
  WHERE m.id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  IF v_meeting.role != 'Leader' AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only facilitator can navigate segments';
  END IF;

  -- Get current active segment
  SELECT * INTO v_current_segment
  FROM public.eos_meeting_segments
  WHERE meeting_id = p_meeting_id
    AND started_at IS NOT NULL
    AND completed_at IS NULL;

  -- Get previous completed segment
  SELECT * INTO v_previous_segment
  FROM public.eos_meeting_segments
  WHERE meeting_id = p_meeting_id
    AND completed_at IS NOT NULL
    AND sequence_order = (
      SELECT MAX(sequence_order)
      FROM public.eos_meeting_segments
      WHERE meeting_id = p_meeting_id
        AND completed_at IS NOT NULL
        AND sequence_order < COALESCE(v_current_segment.sequence_order, 999)
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No previous segment to return to';
  END IF;

  -- Clear current segment (make it pending again)
  IF v_current_segment.id IS NOT NULL THEN
    UPDATE public.eos_meeting_segments
    SET started_at = NULL
    WHERE id = v_current_segment.id;
  END IF;

  -- Re-activate previous segment
  UPDATE public.eos_meeting_segments
  SET completed_at = NULL
  WHERE id = v_previous_segment.id;

  -- Audit log
  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, meeting_id, entity, entity_id, action, details
  ) VALUES (
    v_meeting.tenant_id, auth.uid(), p_meeting_id, 'segment', 
    v_previous_segment.id, 'segment_reverted',
    jsonb_build_object(
      'from_segment', v_current_segment.id,
      'to_segment', v_previous_segment.id
    )
  );

  RETURN v_previous_segment.id;
END;
$$;

-- Drop old create_issue versions and create unified version
DROP FUNCTION IF EXISTS public.create_issue(bigint, text, text, text, text, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.create_issue(bigint, text, text, text, uuid, uuid, uuid);

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
  -- Convert text priority to integer
  v_priority_int := CASE LOWER(p_priority)
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    ELSE 2
  END;

  INSERT INTO eos_issues (
    tenant_id, client_id, title, description, priority, status,
    raised_by, rock_id, meeting_id, created_by
  ) VALUES (
    p_tenant_id, p_client_id, p_title, p_description, v_priority_int, 'open',
    auth.uid(), p_linked_rock_id, p_meeting_id, auth.uid()
  )
  RETURNING id INTO v_issue_id;

  -- Audit log
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