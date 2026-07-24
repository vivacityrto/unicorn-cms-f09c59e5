-- ============================================================
-- Rollback for 20260724002847_eos_overhaul_m12_sync_leader_ratings_legacy_segment_type.sql
-- Restores sync_meeting_to_configuration to its pre-M12 (M11) body,
-- close_meeting_with_validation(uuid, boolean) to its pre-M12 (M6) body,
-- and create_meeting_from_template(8-arg) to its pre-M12 (pre-overhaul,
-- live) body.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_meeting_to_configuration(p_meeting_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_meeting RECORD;
  v_config RECORD;
  v_facilitator_user_id uuid;
  v_total_duration int := 0;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  IF NOT public.has_permission('eos.meetings.l10.create') THEN
    RAISE EXCEPTION 'Forbidden: requires scheduling permission';
  END IF;

  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  IF v_meeting.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Can only sync a meeting that is still scheduled - this can never rewind a live or closed meeting''s progress';
  END IF;

  SELECT * INTO v_config
  FROM public.eos_configurations
  WHERE tenant_id = v_meeting.tenant_id AND meeting_type = v_meeting.meeting_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No Configuration exists for this tenant/meeting type';
  END IF;

  DELETE FROM public.eos_meeting_segments WHERE meeting_id = p_meeting_id;

  INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, segment_type, duration_minutes, sequence_order)
  SELECT p_meeting_id, cs.label, cs.segment_type, cs.duration_minutes, cs.sequence_order
  FROM public.eos_configuration_segments cs
  WHERE cs.configuration_id = v_config.id
  ORDER BY cs.sequence_order;

  SELECT COALESCE(SUM(duration_minutes), 0) INTO v_total_duration
  FROM public.eos_configuration_segments WHERE configuration_id = v_config.id;

  IF v_config.facilitator_seat_id IS NOT NULL THEN
    SELECT user_id INTO v_facilitator_user_id
    FROM public.accountability_seat_assignments
    WHERE seat_id = v_config.facilitator_seat_id
      AND assignment_type = 'Primary'
      AND start_date <= CURRENT_DATE
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
    ORDER BY start_date DESC
    LIMIT 1;
  END IF;

  DELETE FROM public.eos_meeting_participants WHERE meeting_id = p_meeting_id;
  DELETE FROM public.eos_meeting_attendees WHERE meeting_id = p_meeting_id;

  IF v_facilitator_user_id IS NOT NULL THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (p_meeting_id, v_facilitator_user_id, 'Leader')
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;

  IF v_config.participant_model = 'required_seats' THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT p_meeting_id, asn.user_id, 'Member'
    FROM unnest(v_config.required_seat_ids) AS seat_id
    JOIN public.accountability_seat_assignments asn
      ON asn.seat_id = seat_id
     AND asn.assignment_type = 'Primary'
     AND asn.start_date <= CURRENT_DATE
     AND (asn.end_date IS NULL OR asn.end_date >= CURRENT_DATE)
    WHERE asn.user_id IS DISTINCT FROM v_facilitator_user_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;

    INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, seat_id)
    SELECT p_meeting_id, asn.user_id, 'attendee', 'invited', asn.seat_id
    FROM unnest(v_config.required_seat_ids) AS seat_id
    JOIN public.accountability_seat_assignments asn
      ON asn.seat_id = seat_id
     AND asn.assignment_type = 'Primary'
     AND asn.start_date <= CURRENT_DATE
     AND (asn.end_date IS NULL OR asn.end_date >= CURRENT_DATE)
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  ELSE
    INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status)
    SELECT p_meeting_id, staff.user_uuid, 'attendee', 'invited'
    FROM public.get_vivacity_team_directory_staff() AS staff
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;

  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status)
  SELECT p_meeting_id, p.user_id,
    CASE WHEN p.role = 'Leader' THEN 'owner'::text ELSE 'attendee'::text END, 'invited'
  FROM public.eos_meeting_participants p WHERE p.meeting_id = p_meeting_id
  ON CONFLICT (meeting_id, user_id) DO NOTHING;

  UPDATE public.eos_meetings
  SET duration_minutes = v_total_duration, updated_at = now()
  WHERE id = p_meeting_id;

  INSERT INTO public.audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
  VALUES (
    v_meeting.tenant_id, 'meeting', p_meeting_id, 'meeting_synced_to_configuration', auth.uid(),
    jsonb_build_object('configuration_id', v_config.id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_meeting_with_validation(p_meeting_id uuid, p_force boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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
  v_actual_duration INTEGER;
BEGIN
  v_current_user_id := auth.uid();
  SELECT m.*, t.id as tid INTO v_meeting FROM public.eos_meetings m JOIN public.tenants t ON t.id = m.tenant_id WHERE m.id = p_meeting_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Meeting not found'); END IF;
  v_tenant_id := v_meeting.tid;

  SELECT COUNT(*) INTO v_participant_count FROM public.eos_meeting_participants WHERE meeting_id = p_meeting_id;
  IF v_participant_count > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_participants
      WHERE meeting_id = p_meeting_id AND user_id = v_current_user_id AND role = 'Leader'
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Only the meeting facilitator can end this meeting');
    END IF;
  END IF;

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

  IF array_length(v_validation_errors, 1) > 0 AND NOT p_force THEN
    INSERT INTO public.audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
    VALUES (v_tenant_id, p_meeting_id, 'meeting', 'meeting_validation_failed', p_meeting_id, v_current_user_id,
      json_build_object('errors', v_validation_errors));
    RETURN json_build_object('success', false, 'error', 'Validation failed', 'validation_errors', v_validation_errors);
  END IF;

  IF v_meeting.started_at IS NOT NULL THEN
    v_actual_duration := EXTRACT(EPOCH FROM (now() - v_meeting.started_at)) / 60;
  ELSE
    v_actual_duration := v_meeting.duration_minutes;
  END IF;

  UPDATE public.eos_meetings
  SET status = 'closed', completed_at = NOW(), updated_at = NOW(), actual_duration_minutes = v_actual_duration
  WHERE id = p_meeting_id;

  BEGIN
    PERFORM public.generate_meeting_summary(p_meeting_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  INSERT INTO public.audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
  VALUES (v_tenant_id, p_meeting_id, 'meeting', 'meeting_closed', p_meeting_id, v_current_user_id,
    json_build_object('present_count', v_present_count, 'ratings_count', v_ratings_count,
      'forced', p_force, 'validation_warnings', v_validation_errors, 'actual_duration_minutes', v_actual_duration));

  RETURN json_build_object('success', true, 'message', 'Meeting closed successfully',
    'validation_warnings', v_validation_errors);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_tenant_id bigint, p_agenda_template_id uuid, p_title text,
  p_scheduled_date timestamp with time zone, p_duration_minutes integer,
  p_facilitator_id uuid, p_scribe_id uuid DEFAULT NULL::uuid,
  p_participant_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_meeting_id UUID;
  v_template RECORD;
  v_segment JSONB;
  v_sequence INT := 1;
  v_total_duration INT := 0;
  v_is_level10 BOOLEAN := false;
  v_participant_count INT := 0;
  v_seg_name TEXT;
  v_seg_duration INT;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO v_template FROM public.eos_agenda_templates WHERE id = p_agenda_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;

  v_is_level10 := (v_template.meeting_type::text ILIKE '%L10%' OR v_template.meeting_type::text ILIKE '%level%10%');

  INSERT INTO public.eos_meetings (
    tenant_id, meeting_type, title, scheduled_date, duration_minutes,
    template_id, template_version_id, created_by
  ) VALUES (
    p_tenant_id, v_template.meeting_type, p_title, p_scheduled_date,
    p_duration_minutes, p_agenda_template_id, v_template.current_version_id, auth.uid()
  ) RETURNING id INTO v_meeting_id;

  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    v_seg_name := COALESCE(v_segment->>'segment_name', v_segment->>'name', 'Untitled Segment');
    v_seg_duration := COALESCE((v_segment->>'duration_minutes')::INT, (v_segment->>'duration')::INT, 5);
    INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
    VALUES (v_meeting_id, v_seg_name, v_seg_duration, v_sequence);
    v_total_duration := v_total_duration + v_seg_duration;
    v_sequence := v_sequence + 1;
  END LOOP;

  IF v_total_duration != p_duration_minutes THEN
    UPDATE public.eos_meetings SET duration_minutes = v_total_duration WHERE id = v_meeting_id;
  END IF;

  IF p_facilitator_id IS NOT NULL THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_facilitator_id, 'Leader')
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;

  IF p_scribe_id IS NOT NULL AND p_scribe_id IS DISTINCT FROM p_facilitator_id THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_scribe_id, 'Member')
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;

  IF v_is_level10 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, u.user_uuid, 'Member'
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.archived = false
      AND u.is_vivacity_internal = true
      AND u.user_uuid IS NOT NULL
      AND u.user_uuid IS DISTINCT FROM p_facilitator_id
      AND u.user_uuid IS DISTINCT FROM p_scribe_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  ELSIF array_length(p_participant_ids, 1) > 0 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, pid, 'Member'
    FROM unnest(p_participant_ids) AS pid
    WHERE pid IS DISTINCT FROM p_facilitator_id AND pid IS DISTINCT FROM p_scribe_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;

  PERFORM public.seed_meeting_attendees_from_roles(v_meeting_id);
  RETURN v_meeting_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
