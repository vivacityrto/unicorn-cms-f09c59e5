CREATE OR REPLACE FUNCTION public.generate_meeting_summary(p_meeting_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meeting RECORD;
  v_summary_id uuid;
  v_todos jsonb;
  v_issues jsonb;
  v_rocks jsonb;
  v_headlines jsonb;
  v_participants jsonb;
BEGIN
  SELECT * INTO v_meeting FROM eos_meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found'; END IF;

  SELECT id INTO v_summary_id FROM eos_meeting_summaries WHERE meeting_id = p_meeting_id;
  IF v_summary_id IS NOT NULL THEN RETURN v_summary_id; END IF;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'owner_id', owner_id, 'due_date', due_date, 'status', status, 'completed_at', completed_at))
    INTO v_todos FROM eos_todos WHERE meeting_id = p_meeting_id;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status, 'priority', priority, 'solution', solution, 'solved_at', solved_at))
    INTO v_issues FROM eos_issues WHERE meeting_id = p_meeting_id;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'headline', headline, 'is_good_news', is_good_news, 'user_id', user_id))
    INTO v_headlines FROM eos_headlines WHERE meeting_id = p_meeting_id;

  SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'role', role_in_meeting,
    'attended', CASE WHEN attendance_status IN ('attended', 'late', 'left_early') THEN true ELSE false END))
    INTO v_participants FROM eos_meeting_attendees WHERE meeting_id = p_meeting_id;

  INSERT INTO eos_meeting_summaries (meeting_id, tenant_id, todos, issues, headlines, attendance, rocks, cascades)
  VALUES (p_meeting_id, v_meeting.tenant_id,
    COALESCE(v_todos, '[]'::jsonb), COALESCE(v_issues, '[]'::jsonb),
    COALESCE(v_headlines, '[]'::jsonb), COALESCE(v_participants, '[]'::jsonb),
    '[]'::jsonb, '[]'::jsonb)
  RETURNING id INTO v_summary_id;

  UPDATE eos_meetings SET is_complete = true, completed_at = now() WHERE id = p_meeting_id;

  INSERT INTO audit_eos_events (tenant_id, user_id, meeting_id, entity, entity_id, action, reason, details)
  VALUES (v_meeting.tenant_id, auth.uid(), p_meeting_id, 'summary', v_summary_id, 'created',
    'Meeting summary generated',
    jsonb_build_object('todo_count', jsonb_array_length(COALESCE(v_todos, '[]'::jsonb)),
      'issue_count', jsonb_array_length(COALESCE(v_issues, '[]'::jsonb))));

  RETURN v_summary_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_meeting_with_validation(p_meeting_id uuid)
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
BEGIN
  v_current_user_id := auth.uid();
  SELECT m.*, t.id as tid INTO v_meeting FROM eos_meetings m JOIN tenants t ON t.id = m.tenant_id WHERE m.id = p_meeting_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Meeting not found'); END IF;
  v_tenant_id := v_meeting.tid;
  IF v_meeting.status != 'in_progress' THEN
    RETURN json_build_object('success', false, 'error', 'Meeting must be in progress to close');
  END IF;

  SELECT COUNT(*) INTO v_present_count FROM eos_meeting_attendees
    WHERE meeting_id = p_meeting_id AND attendance_status IN ('attended', 'late', 'left_early');
  SELECT COUNT(*) INTO v_total_attendees FROM eos_meeting_attendees WHERE meeting_id = p_meeting_id;

  IF v_total_attendees > 0 THEN
    IF v_present_count < CEIL(v_total_attendees * 0.5) THEN
      v_validation_errors := array_append(v_validation_errors,
        format('Quorum not met: %s present, need %s', v_present_count, CEIL(v_total_attendees * 0.5)::INTEGER));
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_ratings_count FROM eos_meeting_ratings WHERE meeting_id = p_meeting_id;
  v_required_ratings := GREATEST(1, FLOOR(v_present_count * 0.5));
  IF v_ratings_count < v_required_ratings THEN
    v_validation_errors := array_append(v_validation_errors,
      format('Not enough ratings: %s submitted, need %s', v_ratings_count, v_required_ratings));
  END IF;

  IF array_length(v_validation_errors, 1) > 0 THEN
    INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
    VALUES (v_tenant_id, p_meeting_id, 'meeting', 'meeting_validation_failed', p_meeting_id, v_current_user_id,
      json_build_object('errors', v_validation_errors));
    RETURN json_build_object('success', false, 'error', 'Validation failed', 'validation_errors', v_validation_errors);
  END IF;

  UPDATE eos_meetings SET status = 'closed', completed_at = NOW(), updated_at = NOW() WHERE id = p_meeting_id;

  BEGIN
    PERFORM generate_meeting_summary(p_meeting_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
  VALUES (v_tenant_id, p_meeting_id, 'meeting', 'meeting_closed', p_meeting_id, v_current_user_id,
    json_build_object('present_count', v_present_count, 'ratings_count', v_ratings_count));

  RETURN json_build_object('success', true, 'message', 'Meeting closed successfully');
END;
$function$;

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
BEGIN
  v_current_user_id := auth.uid();
  SELECT m.*, t.id as tid INTO v_meeting FROM eos_meetings m JOIN tenants t ON t.id = m.tenant_id WHERE m.id = p_meeting_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Meeting not found'); END IF;
  v_tenant_id := v_meeting.tid;
  IF v_meeting.status != 'in_progress' THEN
    RETURN json_build_object('success', false, 'error', 'Meeting must be in progress to close');
  END IF;

  SELECT COUNT(*) INTO v_present_count FROM eos_meeting_attendees
    WHERE meeting_id = p_meeting_id AND attendance_status IN ('attended', 'late', 'left_early');
  SELECT COUNT(*) INTO v_total_attendees FROM eos_meeting_attendees WHERE meeting_id = p_meeting_id;

  IF v_total_attendees > 0 THEN
    IF v_present_count < CEIL(v_total_attendees * 0.5) THEN
      v_validation_errors := array_append(v_validation_errors,
        format('Quorum not met: %s present, need %s', v_present_count, CEIL(v_total_attendees * 0.5)::INTEGER));
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_ratings_count FROM eos_meeting_ratings WHERE meeting_id = p_meeting_id;
  v_required_ratings := GREATEST(1, FLOOR(v_present_count * 0.5));
  IF v_ratings_count < v_required_ratings THEN
    v_validation_errors := array_append(v_validation_errors,
      format('Not enough ratings: %s submitted, need %s', v_ratings_count, v_required_ratings));
  END IF;

  IF array_length(v_validation_errors, 1) > 0 AND NOT p_force THEN
    INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
    VALUES (v_tenant_id, p_meeting_id, 'meeting', 'meeting_validation_failed', p_meeting_id, v_current_user_id,
      json_build_object('errors', v_validation_errors));
    RETURN json_build_object('success', false, 'error', 'Validation failed', 'validation_errors', v_validation_errors);
  END IF;

  UPDATE eos_meetings SET status = 'closed', completed_at = NOW(), updated_at = NOW() WHERE id = p_meeting_id;

  BEGIN
    PERFORM generate_meeting_summary(p_meeting_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
  VALUES (v_tenant_id, p_meeting_id, 'meeting', 'meeting_closed', p_meeting_id, v_current_user_id,
    json_build_object('present_count', v_present_count, 'ratings_count', v_ratings_count,
      'forced', p_force, 'skipped_warnings', v_validation_errors));

  RETURN json_build_object('success', true, 'message', 'Meeting closed successfully');
END;
$function$;