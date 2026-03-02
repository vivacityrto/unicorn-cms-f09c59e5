
-- Fix 1: close_meeting_with_validation - remove quorum_percentage reference
CREATE OR REPLACE FUNCTION public.close_meeting_with_validation(p_meeting_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_tenant_id INTEGER;
  v_present_count INTEGER;
  v_total_attendees INTEGER;
  v_ratings_count INTEGER;
  v_required_ratings INTEGER;
  v_validation_errors TEXT[] := '{}';
  v_current_user_id UUID;
BEGIN
  v_current_user_id := auth.uid();
  
  SELECT m.*, t.id as tid
  INTO v_meeting
  FROM eos_meetings m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.id = p_meeting_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Meeting not found');
  END IF;
  
  v_tenant_id := v_meeting.tid;
  
  IF v_meeting.status != 'in_progress' THEN
    RETURN json_build_object('success', false, 'error', 'Meeting must be in progress to close');
  END IF;
  
  -- Count present attendees
  SELECT COUNT(*) INTO v_present_count
  FROM eos_meeting_attendees
  WHERE meeting_id = p_meeting_id 
    AND attendance_status IN ('attended', 'late', 'left_early');
  
  -- Count total attendees
  SELECT COUNT(*) INTO v_total_attendees
  FROM eos_meeting_attendees
  WHERE meeting_id = p_meeting_id;
  
  -- Quorum check: use 50% default (no quorum_percentage column exists)
  IF v_total_attendees > 0 THEN
    IF v_present_count < CEIL(v_total_attendees * 0.5) THEN
      v_validation_errors := array_append(v_validation_errors, 
        format('Quorum not met: %s present, need %s', 
          v_present_count, 
          CEIL(v_total_attendees * 0.5)::INTEGER));
    END IF;
  END IF;
  
  -- Count ratings submitted
  SELECT COUNT(*) INTO v_ratings_count
  FROM eos_meeting_ratings
  WHERE meeting_id = p_meeting_id;
  
  v_required_ratings := GREATEST(1, FLOOR(v_present_count * 0.5));
  
  IF v_ratings_count < v_required_ratings THEN
    v_validation_errors := array_append(v_validation_errors,
      format('Not enough ratings: %s submitted, need %s', v_ratings_count, v_required_ratings));
  END IF;
  
  IF array_length(v_validation_errors, 1) > 0 THEN
    INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
    VALUES (
      v_tenant_id, p_meeting_id, 'meeting', 'meeting_validation_failed',
      p_meeting_id, v_current_user_id,
      json_build_object('errors', v_validation_errors)
    );
    
    RETURN json_build_object(
      'success', false, 'error', 'Validation failed',
      'validation_errors', v_validation_errors
    );
  END IF;
  
  UPDATE eos_meetings
  SET status = 'closed', completed_at = NOW(), updated_at = NOW()
  WHERE id = p_meeting_id;
  
  PERFORM generate_meeting_summary(p_meeting_id);
  
  INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
  VALUES (
    v_tenant_id, p_meeting_id, 'meeting', 'meeting_closed',
    p_meeting_id, v_current_user_id,
    json_build_object('present_count', v_present_count, 'ratings_count', v_ratings_count)
  );
  
  RETURN json_build_object('success', true, 'message', 'Meeting closed successfully');
END;
$$;

-- Fix 2: generate_meeting_summary - use eos_meeting_attendees instead of eos_meeting_participants
CREATE OR REPLACE FUNCTION public.generate_meeting_summary(p_meeting_id UUID)
RETURNS UUID
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
  SELECT * INTO v_meeting
  FROM eos_meetings
  WHERE id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  IF NOT (
    is_super_admin() OR
    has_meeting_role(auth.uid(), p_meeting_id, ARRAY['Leader'])
  ) THEN
    RAISE EXCEPTION 'Only facilitator can generate summary';
  END IF;

  -- Idempotent: return existing summary
  SELECT id INTO v_summary_id
  FROM eos_meeting_summaries
  WHERE meeting_id = p_meeting_id;

  IF v_summary_id IS NOT NULL THEN
    RETURN v_summary_id;
  END IF;

  -- Aggregate to-dos
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id, 'title', title, 'owner_id', owner_id,
      'due_date', due_date, 'status', status, 'completed_at', completed_at
    )
  ) INTO v_todos
  FROM eos_todos
  WHERE meeting_id = p_meeting_id;

  -- Aggregate issues
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id, 'title', title, 'status', status,
      'priority', priority, 'solution', solution, 'solved_at', solved_at
    )
  ) INTO v_issues
  FROM eos_issues
  WHERE meeting_id = p_meeting_id;

  -- Aggregate headlines
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id, 'headline', headline,
      'is_good_news', is_good_news, 'user_id', user_id
    )
  ) INTO v_headlines
  FROM eos_headlines
  WHERE meeting_id = p_meeting_id;

  -- Aggregate attendees (fixed: was eos_meeting_participants)
  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id', user_id,
      'role', role_in_meeting,
      'attended', CASE WHEN attendance_status IN ('attended', 'late', 'left_early') THEN true ELSE false END
    )
  ) INTO v_participants
  FROM eos_meeting_attendees
  WHERE meeting_id = p_meeting_id;

  -- Create summary
  INSERT INTO eos_meeting_summaries (
    meeting_id, tenant_id, todos, issues, headlines, attendance, rocks, cascades
  ) VALUES (
    p_meeting_id, v_meeting.tenant_id,
    COALESCE(v_todos, '[]'::jsonb),
    COALESCE(v_issues, '[]'::jsonb),
    COALESCE(v_headlines, '[]'::jsonb),
    COALESCE(v_participants, '[]'::jsonb),
    '[]'::jsonb, '[]'::jsonb
  ) RETURNING id INTO v_summary_id;

  UPDATE eos_meetings
  SET is_complete = true, completed_at = now()
  WHERE id = p_meeting_id;

  INSERT INTO audit_eos_events (
    tenant_id, user_id, meeting_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_meeting.tenant_id, auth.uid(), p_meeting_id, 'summary', v_summary_id, 'created',
    'Meeting summary generated',
    jsonb_build_object(
      'todo_count', jsonb_array_length(COALESCE(v_todos, '[]'::jsonb)),
      'issue_count', jsonb_array_length(COALESCE(v_issues, '[]'::jsonb))
    )
  );

  RETURN v_summary_id;
END;
$$;

-- Fix 3: validate_meeting_close - use eos_meeting_attendees instead of eos_meeting_participants
CREATE OR REPLACE FUNCTION public.validate_meeting_close(p_meeting_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_unmet_requirements TEXT[] := '{}';
  v_todos_count INTEGER;
  v_issues_discussed INTEGER;
  v_ratings_count INTEGER;
  v_attendees_count INTEGER;
  v_has_no_todos_confirm BOOLEAN;
  v_has_no_ids_confirm BOOLEAN;
  v_has_no_actions_confirm BOOLEAN;
  v_has_no_decisions_confirm BOOLEAN;
  v_has_alignment_confirm BOOLEAN;
  v_has_all_rocks_closed BOOLEAN;
  v_has_flight_plan_confirm BOOLEAN;
  v_has_vto_reviewed BOOLEAN;
  v_has_priorities_set BOOLEAN;
  v_has_no_risks_confirm BOOLEAN;
BEGIN
  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('is_valid', false, 'error', 'Meeting not found', 'unmet_requirements', '{}');
  END IF;

  SELECT COUNT(*) INTO v_todos_count 
  FROM public.eos_todos WHERE meeting_id = p_meeting_id;

  SELECT COALESCE(array_length(v_meeting.issues_discussed, 1), 0) INTO v_issues_discussed;

  SELECT COUNT(*) INTO v_ratings_count 
  FROM public.eos_meeting_ratings WHERE meeting_id = p_meeting_id;

  -- Fixed: use eos_meeting_attendees instead of eos_meeting_participants
  SELECT COUNT(*) INTO v_attendees_count 
  FROM public.eos_meeting_attendees WHERE meeting_id = p_meeting_id;

  -- Get explicit confirmations
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'no_todos_required') INTO v_has_no_todos_confirm;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'no_ids_required') INTO v_has_no_ids_confirm;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'no_actions_required') INTO v_has_no_actions_confirm;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'no_decisions_required') INTO v_has_no_decisions_confirm;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'alignment_achieved') INTO v_has_alignment_confirm;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'all_rocks_closed') INTO v_has_all_rocks_closed;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'flight_plan_confirmed') INTO v_has_flight_plan_confirm;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'vto_reviewed') INTO v_has_vto_reviewed;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'annual_priorities_set') INTO v_has_priorities_set;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'no_risks_required') INTO v_has_no_risks_confirm;

  CASE v_meeting.meeting_type::TEXT
    WHEN 'L10' THEN
      IF v_issues_discussed = 0 AND NOT v_has_no_ids_confirm THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'At least one issue discussed (or confirm "No IDS items required")');
      END IF;
      IF v_todos_count = 0 AND NOT v_has_no_todos_confirm THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'At least one To-Do created (or confirm "No To-Dos required")');
      END IF;
      IF v_ratings_count = 0 THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'At least one meeting rating required');
      END IF;

    WHEN 'Same_Page' THEN
      IF NOT v_has_no_decisions_confirm THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'At least one decision captured (or confirm "No decisions required")');
      END IF;
      IF v_todos_count = 0 AND NOT v_has_no_actions_confirm AND NOT v_has_alignment_confirm THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'At least one action created (or confirm "Alignment achieved, no actions required")');
      END IF;

    WHEN 'Quarterly' THEN
      IF NOT v_has_all_rocks_closed THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'Previous quarter Rocks must be marked Complete, Rolled, or Dropped (or confirm "All Rocks closed")');
      END IF;
      IF NOT v_has_flight_plan_confirm THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'Superhero Flight Plan must be confirmed');
      END IF;

    WHEN 'Annual' THEN
      IF NOT v_has_vto_reviewed THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'Vision/Traction Organizer must be reviewed');
      END IF;
      IF NOT v_has_priorities_set THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'At least one annual priority must be defined');
      END IF;
      IF NOT v_has_no_risks_confirm THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'Strategic risks must be logged (or confirm "No risks identified")');
      END IF;

    ELSE
      NULL;
  END CASE;

  IF array_length(v_unmet_requirements, 1) > 0 THEN
    RETURN jsonb_build_object(
      'is_valid', false,
      'error', 'Meeting cannot be closed. Required outcomes are missing.',
      'unmet_requirements', to_jsonb(v_unmet_requirements),
      'meeting_type', v_meeting.meeting_type::TEXT,
      'todos_count', v_todos_count,
      'issues_discussed', v_issues_discussed,
      'ratings_count', v_ratings_count
    );
  END IF;

  RETURN jsonb_build_object(
    'is_valid', true,
    'meeting_type', v_meeting.meeting_type::TEXT,
    'todos_count', v_todos_count,
    'issues_discussed', v_issues_discussed,
    'ratings_count', v_ratings_count
  );
END;
$$;
