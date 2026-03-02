
CREATE OR REPLACE FUNCTION public.validate_meeting_close(p_meeting_id UUID)
RETURNS jsonb
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
  v_present_count INTEGER;
  v_total_attendees INTEGER;
  v_required_ratings INTEGER;
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

  -- Count present attendees (same logic as close_meeting_with_validation)
  SELECT COUNT(*) INTO v_present_count
  FROM public.eos_meeting_attendees 
  WHERE meeting_id = p_meeting_id 
    AND attendance_status IN ('attended', 'late', 'left_early');

  SELECT COUNT(*) INTO v_total_attendees
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

  -- Quorum check (aligned with close_meeting_with_validation)
  IF v_total_attendees > 0 THEN
    IF v_present_count < CEIL(v_total_attendees * 0.5) THEN
      v_unmet_requirements := array_append(v_unmet_requirements, 
        format('Quorum not met: %s present, need %s', v_present_count, CEIL(v_total_attendees * 0.5)::INTEGER));
    END IF;
  END IF;

  -- Ratings check (aligned with close_meeting_with_validation)
  v_required_ratings := GREATEST(1, FLOOR(v_present_count * 0.5));
  IF v_ratings_count < v_required_ratings THEN
    v_unmet_requirements := array_append(v_unmet_requirements, 
      format('Not enough ratings: %s submitted, need %s', v_ratings_count, v_required_ratings));
  END IF;

  CASE v_meeting.meeting_type::TEXT
    WHEN 'L10' THEN
      IF v_issues_discussed = 0 AND NOT v_has_no_ids_confirm THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'At least one issue discussed (or confirm "No IDS items required")');
      END IF;
      IF v_todos_count = 0 AND NOT v_has_no_todos_confirm THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'At least one To-Do created (or confirm "No To-Dos required")');
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
        v_unmet_requirements := array_append(v_unmet_requirements, 'Annual priorities must be defined');
      END IF;

    ELSE
      NULL;
  END CASE;

  RETURN jsonb_build_object(
    'is_valid', array_length(v_unmet_requirements, 1) IS NULL,
    'unmet_requirements', v_unmet_requirements,
    'todos_count', v_todos_count,
    'issues_discussed', v_issues_discussed,
    'ratings_count', v_ratings_count,
    'meeting_type', v_meeting.meeting_type::TEXT,
    'present_count', v_present_count,
    'required_ratings', v_required_ratings
  );
END;
$$;
