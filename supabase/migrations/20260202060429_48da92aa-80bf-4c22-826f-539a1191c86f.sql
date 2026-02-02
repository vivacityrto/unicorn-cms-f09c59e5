-- Fix: Remove TEXT casts for entity_id in close_meeting_with_validation
-- The entity_id column in audit_eos_events is now UUID, not TEXT
-- Must DROP first due to return type difference

DROP FUNCTION IF EXISTS public.close_meeting_with_validation(UUID);

CREATE FUNCTION public.close_meeting_with_validation(p_meeting_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_tenant_id INTEGER;
  v_present_count INTEGER;
  v_required_attendees INTEGER;
  v_ratings_count INTEGER;
  v_required_ratings INTEGER;
  v_quorum_pct NUMERIC;
  v_validation_errors TEXT[] := '{}';
  v_current_user_id UUID;
BEGIN
  -- Get current user
  v_current_user_id := auth.uid();
  
  -- Get meeting details
  SELECT m.*, t.id as tid
  INTO v_meeting
  FROM eos_meetings m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.id = p_meeting_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Meeting not found');
  END IF;
  
  v_tenant_id := v_meeting.tid;
  
  -- Check meeting is in progress
  IF v_meeting.status != 'in_progress' THEN
    RETURN json_build_object('success', false, 'error', 'Meeting must be in progress to close');
  END IF;
  
  -- Count present attendees
  SELECT COUNT(*) INTO v_present_count
  FROM eos_meeting_attendees
  WHERE meeting_id = p_meeting_id AND is_present = true;
  
  -- Count required attendees (those marked as required)
  SELECT COUNT(*) INTO v_required_attendees
  FROM eos_meeting_attendees
  WHERE meeting_id = p_meeting_id AND is_required = true;
  
  -- Get quorum percentage from meeting or default to 50%
  v_quorum_pct := COALESCE(v_meeting.quorum_percentage, 50);
  
  -- Check quorum if there are required attendees
  IF v_required_attendees > 0 THEN
    IF v_present_count < CEIL(v_required_attendees * v_quorum_pct / 100.0) THEN
      v_validation_errors := array_append(v_validation_errors, 
        format('Quorum not met: %s present, need %s', 
          v_present_count, 
          CEIL(v_required_attendees * v_quorum_pct / 100.0)::INTEGER));
    END IF;
  END IF;
  
  -- Count ratings submitted
  SELECT COUNT(*) INTO v_ratings_count
  FROM eos_meeting_ratings
  WHERE meeting_id = p_meeting_id;
  
  -- Required ratings is based on present count
  v_required_ratings := GREATEST(1, FLOOR(v_present_count * 0.5));
  
  -- Check if we have enough ratings
  IF v_ratings_count < v_required_ratings THEN
    v_validation_errors := array_append(v_validation_errors,
      format('Not enough ratings: %s submitted, need %s', v_ratings_count, v_required_ratings));
  END IF;
  
  -- If validation fails, log and return errors
  IF array_length(v_validation_errors, 1) > 0 THEN
    -- Log validation failure (entity_id is UUID, no cast needed)
    INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
    VALUES (
      v_tenant_id,
      p_meeting_id,
      'meeting',
      'meeting_validation_failed',
      p_meeting_id,
      v_current_user_id,
      json_build_object('errors', v_validation_errors)
    );
    
    RETURN json_build_object(
      'success', false,
      'error', 'Validation failed',
      'validation_errors', v_validation_errors
    );
  END IF;
  
  -- All validations passed - close the meeting
  UPDATE eos_meetings
  SET 
    status = 'closed',
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_meeting_id;
  
  -- Generate meeting summary
  PERFORM generate_meeting_summary(p_meeting_id);
  
  -- Log successful closure (entity_id is UUID, no cast needed)
  INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
  VALUES (
    v_tenant_id,
    p_meeting_id,
    'meeting',
    'meeting_closed',
    p_meeting_id,
    v_current_user_id,
    json_build_object(
      'present_count', v_present_count,
      'ratings_count', v_ratings_count
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'message', 'Meeting closed successfully'
  );
END;
$$;