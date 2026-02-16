
-- 1) Fix calculate_quorum: owner is warning-only, not a hard gate
-- quorum_met based on present_count >= 1 by default
CREATE OR REPLACE FUNCTION public.calculate_quorum(p_meeting_id uuid)
RETURNS TABLE(
  quorum_required integer,
  quorum_present integer,
  quorum_met boolean,
  owner_present boolean,
  visionary_present boolean,
  integrator_present boolean,
  core_team_present integer,
  core_team_required integer,
  issues text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting_type TEXT;
  v_total_invited INTEGER;
  v_total_present INTEGER;
  v_owner_present BOOLEAN := false;
  v_visionary_present BOOLEAN := false;
  v_integrator_present BOOLEAN := false;
  v_core_present INTEGER := 0;
  v_core_required INTEGER := 0;
  v_issues TEXT[] := '{}';
  v_quorum_met BOOLEAN := false;
  v_required_present NUMERIC;
BEGIN
  SELECT meeting_type::TEXT INTO v_meeting_type
  FROM eos_meetings WHERE id = p_meeting_id;

  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE attendance_status IN ('attended', 'late')),
    COALESCE(bool_or(role_in_meeting = 'owner' AND attendance_status IN ('attended', 'late')), false),
    COALESCE(bool_or(role_in_meeting = 'visionary' AND attendance_status IN ('attended', 'late')), false),
    COALESCE(bool_or(role_in_meeting = 'integrator' AND attendance_status IN ('attended', 'late')), false),
    COUNT(*) FILTER (WHERE role_in_meeting = 'core_team' AND attendance_status IN ('attended', 'late')),
    COUNT(*) FILTER (WHERE role_in_meeting = 'core_team')
  INTO v_total_invited, v_total_present, v_owner_present, v_visionary_present, v_integrator_present, v_core_present, v_core_required
  FROM eos_meeting_attendees
  WHERE meeting_id = p_meeting_id;

  -- Owner absence is now WARNING only, never blocks
  IF NOT v_owner_present THEN
    v_issues := array_append(v_issues, 'Owner not present — Facilitator controls the meeting');
  END IF;

  IF v_meeting_type = 'L10' THEN
    -- L10: at least 1 person present (quorum_min default)
    v_required_present := 1;
    v_quorum_met := v_total_present >= v_required_present;
    IF NOT v_quorum_met THEN
      v_issues := array_append(v_issues, 'At least 1 attendee must be present');
    END IF;

  ELSIF v_meeting_type = 'Same_Page' THEN
    -- Same Page: Visionary AND Integrator still required
    IF NOT v_visionary_present THEN
      v_issues := array_append(v_issues, 'Visionary must be present');
    END IF;
    IF NOT v_integrator_present THEN
      v_issues := array_append(v_issues, 'Integrator must be present');
    END IF;
    v_quorum_met := v_visionary_present AND v_integrator_present;

  ELSIF v_meeting_type = 'Quarterly' THEN
    -- Quarterly: 80% core team, owner NOT required for quorum
    IF v_core_required > 0 THEN
      v_required_present := CEIL(v_core_required * 0.8);
      IF v_core_present < v_required_present THEN
        v_issues := array_append(v_issues, format('At least %s of %s core team members must be present', v_required_present::INTEGER, v_core_required));
      END IF;
      v_quorum_met := v_core_present >= v_required_present;
    ELSE
      v_quorum_met := v_total_present >= 1;
    END IF;

  ELSIF v_meeting_type = 'Annual' THEN
    -- Annual: Visionary + Integrator required, owner NOT required
    IF NOT v_visionary_present THEN
      v_issues := array_append(v_issues, 'Visionary must be present');
    END IF;
    IF NOT v_integrator_present THEN
      v_issues := array_append(v_issues, 'Integrator must be present');
    END IF;
    v_quorum_met := v_visionary_present AND v_integrator_present;

  ELSE
    -- Default: at least 1 present
    v_quorum_met := v_total_present >= 1;
  END IF;

  RETURN QUERY SELECT 
    COALESCE(v_required_present::INTEGER, 1),
    v_total_present,
    v_quorum_met,
    v_owner_present,
    v_visionary_present,
    v_integrator_present,
    v_core_present,
    v_core_required,
    v_issues;
END;
$$;

-- 2) Fix start_meeting_with_quorum_check: never block for owner absence
-- Only Same Page is blocked (Visionary+Integrator). Others just warn.
CREATE OR REPLACE FUNCTION public.start_meeting_with_quorum_check(
  p_meeting_id uuid,
  p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_quorum RECORD;
BEGIN
  SELECT * INTO v_meeting FROM eos_meetings WHERE id = p_meeting_id;
  
  IF v_meeting IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting not found');
  END IF;
  
  IF v_meeting.status NOT IN ('scheduled', 'Scheduled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting is not in scheduled state');
  END IF;

  SELECT * INTO v_quorum FROM calculate_quorum(p_meeting_id);
  
  -- Only Same Page meetings are hard-blocked
  IF v_meeting.meeting_type = 'Same_Page' AND NOT v_quorum.quorum_met AND p_override_reason IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Cannot start Same Page meeting without Visionary and Integrator',
      'quorum', row_to_json(v_quorum),
      'requires_override', false,
      'blocked', true
    );
  END IF;
  
  -- For all other types: if quorum not met, just proceed with a note (no override needed)
  -- Meeting can always start as long as at least 1 person is present
  
  UPDATE eos_meetings
  SET 
    status = 'in_progress',
    started_at = now(),
    quorum_met = v_quorum.quorum_met,
    quorum_override_reason = p_override_reason,
    quorum_override_by = CASE WHEN p_override_reason IS NOT NULL THEN auth.uid() ELSE NULL END,
    agenda_snapshot = (
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'segment_type', s.segment_type,
        'duration_minutes', s.duration_minutes,
        'sort_order', s.sort_order
      ) ORDER BY s.sort_order)
      FROM eos_meeting_segments s
      WHERE s.meeting_id = p_meeting_id
    ),
    updated_at = now()
  WHERE id = p_meeting_id;
  
  INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, user_id, details)
  SELECT 
    v_meeting.tenant_id,
    p_meeting_id,
    'meeting',
    CASE WHEN v_quorum.quorum_met THEN 'meeting_started' ELSE 'meeting_started_without_quorum' END,
    auth.uid(),
    jsonb_build_object(
      'quorum_met', v_quorum.quorum_met,
      'override_reason', p_override_reason,
      'quorum_details', row_to_json(v_quorum)
    );
  
  RETURN jsonb_build_object(
    'success', true,
    'quorum_met', v_quorum.quorum_met,
    'quorum', row_to_json(v_quorum)
  );
END;
$$;

-- 3) Fix add_meeting_attendee: allow adding during in_progress (not just 'live')
CREATE OR REPLACE FUNCTION public.add_meeting_attendee(
  p_meeting_id uuid,
  p_user_id uuid,
  p_role meeting_role DEFAULT 'attendee'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_attendee_id UUID;
BEGIN
  SELECT * INTO v_meeting
  FROM public.eos_meetings
  WHERE id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  -- Only block adding to ended/completed meetings
  IF v_meeting.status IN ('ended', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot add attendees to an ended or cancelled meeting';
  END IF;

  INSERT INTO public.eos_meeting_attendees (
    meeting_id,
    user_id,
    role_in_meeting,
    attendance_status,
    created_at,
    updated_at
  ) VALUES (
    p_meeting_id,
    p_user_id,
    p_role,
    CASE 
      WHEN v_meeting.status IN ('in_progress', 'live') THEN 'attended'::meeting_attendance_status
      ELSE 'invited'::meeting_attendance_status
    END,
    NOW(),
    NOW()
  )
  ON CONFLICT (meeting_id, user_id) DO UPDATE SET
    role_in_meeting = EXCLUDED.role_in_meeting,
    attendance_status = CASE 
      WHEN v_meeting.status IN ('in_progress', 'live') THEN 'attended'::meeting_attendance_status
      ELSE eos_meeting_attendees.attendance_status
    END,
    updated_at = NOW()
  RETURNING id INTO v_attendee_id;

  RETURN v_attendee_id;
END;
$$;
