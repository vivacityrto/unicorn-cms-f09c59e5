CREATE OR REPLACE FUNCTION public.close_meeting_with_validation(p_meeting_id uuid, p_force boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meeting RECORD;
  v_tenant_id INTEGER;
  v_present_count INTEGER;
  v_total_attendees INTEGER;
  v_ratings_count INTEGER;
  v_required_ratings INTEGER;
  v_validation_errors TEXT[] := '{}';
  v_current_user_id UUID;
  v_participant_count INTEGER;
BEGIN
  v_current_user_id := auth.uid();
  SELECT m.*, t.id as tid INTO v_meeting FROM public.eos_meetings m JOIN public.tenants t ON t.id = m.tenant_id WHERE m.id = p_meeting_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Meeting not found'); END IF;
  v_tenant_id := v_meeting.tid;

  -- Facilitator authorization. If no participants configured yet, allow any
  -- authenticated caller (bootstrap). Otherwise require caller to be a Leader.
  SELECT COUNT(*) INTO v_participant_count FROM public.eos_meeting_participants WHERE meeting_id = p_meeting_id;
  IF v_participant_count > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_participants
      WHERE meeting_id = p_meeting_id
        AND user_id = v_current_user_id
        AND role = 'Leader'
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Only the meeting facilitator can end this meeting');
    END IF;
  END IF;

  -- Status gate: normally must be in_progress. Allow force-close ONLY when the
  -- meeting was actually started (at least one segment has started_at set),
  -- so a status drift caused by a silent RLS failure no longer permanently
  -- traps the meeting. Never-started meetings remain blocked even with force.
  IF v_meeting.status != 'in_progress' AND NOT (
    p_force AND EXISTS (
      SELECT 1 FROM public.eos_meeting_segments
      WHERE meeting_id = p_meeting_id AND started_at IS NOT NULL
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Meeting must be in progress to close');
  END IF;

  SELECT COUNT(*) INTO v_present_count FROM public.eos_meeting_attendees
    WHERE meeting_id = p_meeting_id AND attendance_status IN ('attended', 'late', 'left_early');
  SELECT COUNT(*) INTO v_total_attendees FROM public.eos_meeting_attendees WHERE meeting_id = p_meeting_id;

  IF v_total_attendees > 0 THEN
    IF v_present_count < CEIL(v_total_attendees * 0.5) THEN
      v_validation_errors := array_append(v_validation_errors,
        format('Quorum not met: %s present, need %s', v_present_count, CEIL(v_total_attendees * 0.5)::INTEGER));
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_ratings_count FROM public.eos_meeting_ratings WHERE meeting_id = p_meeting_id;
  v_required_ratings := GREATEST(1, FLOOR(v_present_count * 0.5));
  IF v_ratings_count < v_required_ratings THEN
    v_validation_errors := array_append(v_validation_errors,
      format('Not enough ratings: %s submitted, need %s', v_ratings_count, v_required_ratings));
  END IF;

  -- Validation warnings are informational only. They are logged into the audit
  -- event details below but never block closing once the facilitator confirms.

  UPDATE public.eos_meetings SET status = 'closed', completed_at = NOW(), updated_at = NOW() WHERE id = p_meeting_id;

  BEGIN
    PERFORM public.generate_meeting_summary(p_meeting_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  INSERT INTO public.audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
  VALUES (v_tenant_id, p_meeting_id, 'meeting', 'meeting_closed', p_meeting_id, v_current_user_id,
    json_build_object('present_count', v_present_count, 'ratings_count', v_ratings_count,
      'forced', p_force, 'validation_warnings', v_validation_errors));

  RETURN json_build_object('success', true, 'message', 'Meeting closed successfully',
    'validation_warnings', v_validation_errors);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.close_meeting_with_validation(uuid, boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_meeting_with_validation(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';