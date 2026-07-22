
-- L3 (16 Jul 2026 addendum): Meetings/EOS cluster. All operate on eos_meetings/
-- eos_meeting_* -- Vivacity's internal EOS operating-system tables, never
-- client-facing -- and none had any caller-identity check despite being
-- SECURITY DEFINER and RPC-callable by any authenticated user. Gate:
-- is_vivacity_team_safe(auth.uid()), same pattern as the audit-workflow and
-- TGA-sync clusters. No business-logic changes beyond the gate; facilitator/
-- scribe role assignment semantics are left exactly as designed.

create or replace function public.add_meeting_attendee(p_meeting_id uuid, p_user_id uuid, p_role text DEFAULT 'attendee'::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE v_meeting RECORD; v_attendee_id UUID;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found'; END IF;
  IF v_meeting.status IN ('ended', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot add attendees to an ended or cancelled meeting'; END IF;

  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  VALUES (p_meeting_id, p_user_id, p_role,
    CASE WHEN v_meeting.status IN ('in_progress', 'live') THEN 'attended' ELSE 'invited' END, NOW(), NOW())
  ON CONFLICT (meeting_id, user_id) DO UPDATE SET
    role_in_meeting = EXCLUDED.role_in_meeting,
    attendance_status = CASE WHEN v_meeting.status IN ('in_progress', 'live') THEN 'attended' ELSE eos_meeting_attendees.attendance_status END,
    updated_at = NOW()
  RETURNING id INTO v_attendee_id;

  RETURN v_attendee_id;
END;
$function$;

create or replace function public.remove_meeting_attendee(p_meeting_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_meeting RECORD;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO v_meeting
  FROM public.eos_meetings
  WHERE id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  IF v_meeting.status IN ('live', 'ended') THEN
    RAISE EXCEPTION 'Cannot remove attendees from a live or ended meeting';
  END IF;

  DELETE FROM public.eos_meeting_attendees
  WHERE meeting_id = p_meeting_id AND user_id = p_user_id;

  RETURN FOUND;
END;
$function$;

create or replace function public.cascade_stage_recurring(p_stage_id integer, p_is_recurring boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_ps_count integer;
  v_si_count integer;
  v_stage_title text;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  -- Verify stage exists in the canonical 'stages' table
  SELECT name INTO v_stage_title
  FROM stages WHERE id = p_stage_id;

  IF v_stage_title IS NULL THEN
    RAISE EXCEPTION 'Stage % not found', p_stage_id;
  END IF;

  -- Update the stages registry
  UPDATE stages
  SET is_recurring = p_is_recurring
  WHERE id = p_stage_id;

  -- Cascade to all package_stages
  UPDATE package_stages
  SET is_recurring = p_is_recurring
  WHERE stage_id = p_stage_id;
  GET DIAGNOSTICS v_ps_count = ROW_COUNT;

  -- Cascade to all stage_instances for ACTIVE (non-complete) package instances only
  UPDATE stage_instances si
  SET is_recurring = p_is_recurring
  FROM package_instances pi
  WHERE si.stage_id = p_stage_id
    AND si.packageinstance_id = pi.id
    AND pi.is_complete = false;
  GET DIAGNOSTICS v_si_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'stage_title', v_stage_title,
    'package_stages_updated', v_ps_count,
    'stage_instances_updated', v_si_count
  );
END;
$function$;

create or replace function public.apply_template_to_meeting(p_meeting_id uuid, p_template_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_template RECORD;
  v_segment JSONB;
  v_sequence INT := 1;
  v_total_duration INT := 0;
  v_segment_name TEXT;
  v_duration INT;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  DELETE FROM public.eos_meeting_segments
  WHERE meeting_id = p_meeting_id;

  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    v_segment_name := COALESCE(v_segment->>'segment_name', v_segment->>'name');
    v_duration := COALESCE(
      (v_segment->>'duration_minutes')::INT,
      (v_segment->>'duration')::INT
    );

    INSERT INTO public.eos_meeting_segments (
      meeting_id, segment_name, duration_minutes, sequence_order
    ) VALUES (
      p_meeting_id, v_segment_name, v_duration, v_sequence
    );

    v_total_duration := v_total_duration + v_duration;
    v_sequence := v_sequence + 1;
  END LOOP;

  UPDATE public.eos_meetings
  SET duration_minutes = v_total_duration,
      template_id = p_template_id,
      template_version_id = v_template.current_version_id,
      updated_at = NOW()
  WHERE id = p_meeting_id;
END;
$function$;

create or replace function public.complete_meeting_with_carry_forward(p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_meeting RECORD;
  v_next_meeting_id UUID;
  v_carried_issues UUID[];
  v_carried_todos UUID[];
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO v_meeting FROM eos_meetings WHERE id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  BEGIN
    PERFORM complete_meeting_instance(p_meeting_id);
  EXCEPTION WHEN undefined_function THEN
    UPDATE eos_meetings SET status = 'closed', updated_at = NOW() WHERE id = p_meeting_id;
  END;

  SELECT next_meeting_id INTO v_next_meeting_id FROM eos_meetings WHERE id = p_meeting_id;

  IF v_next_meeting_id IS NOT NULL THEN
    BEGIN
      SELECT carry_forward_unresolved_issues(p_meeting_id, v_next_meeting_id) INTO v_carried_issues;
    EXCEPTION WHEN undefined_function THEN
      v_carried_issues := '{}';
    END;

    SELECT carry_forward_open_todos(p_meeting_id, v_next_meeting_id) INTO v_carried_todos;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'next_meeting_id', v_next_meeting_id,
    'carried_issues', COALESCE(array_length(v_carried_issues, 1), 0),
    'carried_todos', COALESCE(array_length(v_carried_todos, 1), 0)
  );
END;
$function$;

create or replace function public.start_meeting_with_validation(p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_validation RECORD;
  v_first_segment_id UUID;
  v_meeting_type TEXT;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT meeting_type::TEXT INTO v_meeting_type
  FROM public.eos_meetings
  WHERE id = p_meeting_id;

  IF v_meeting_type IN ('L10', 'Quarterly', 'Annual', 'Same_Page') THEN
    SELECT * INTO v_validation
    FROM public.validate_meeting_agenda(p_meeting_id);

    IF NOT v_validation.is_valid THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', v_validation.error_message,
        'missing_segments', v_validation.missing_segments
      );
    END IF;
  END IF;

  SELECT id INTO v_first_segment_id
  FROM public.eos_meeting_segments
  WHERE meeting_id = p_meeting_id
  ORDER BY sequence_order ASC
  LIMIT 1;

  IF v_first_segment_id IS NOT NULL THEN
    UPDATE public.eos_meeting_segments
    SET started_at = NOW()
    WHERE id = v_first_segment_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'meeting_id', p_meeting_id,
    'first_segment_id', v_first_segment_id
  );
END;
$function$;

create or replace function public.sync_l10_meeting_participants(p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_meeting_type text;
  v_added_count integer := 0;
  v_total_count integer := 0;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT meeting_type::text INTO v_meeting_type
  FROM public.eos_meetings WHERE id = p_meeting_id;

  IF v_meeting_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting not found');
  END IF;

  IF v_meeting_type != 'L10' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an L10 meeting');
  END IF;

  WITH inserted AS (
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT p_meeting_id, au.id, 'Member'
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.is_vivacity_internal = true
      AND u.archived IS DISTINCT FROM true
    ON CONFLICT (meeting_id, user_id) DO NOTHING
    RETURNING user_id
  )
  SELECT count(*) INTO v_added_count FROM inserted;

  SELECT count(*) INTO v_total_count
  FROM public.eos_meeting_participants WHERE meeting_id = p_meeting_id;

  RETURN jsonb_build_object(
    'success', true, 'meeting_id', p_meeting_id,
    'added_count', v_added_count, 'total_count', v_total_count
  );
END;
$function$;

create or replace function public.seed_meeting_attendees_from_roles(p_meeting_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_meeting RECORD;
  v_inserted_count integer := 0;
  v_participant_count integer := 0;
  v_vivacity_count integer := 0;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  IF v_meeting IS NULL THEN RAISE EXCEPTION 'Meeting not found'; END IF;

  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  SELECT p_meeting_id, mp.user_id,
    CASE mp.role::text WHEN 'Leader' THEN 'owner' ELSE 'attendee' END,
    'invited', NOW(), NOW()
  FROM public.eos_meeting_participants mp
  WHERE mp.meeting_id = p_meeting_id
    AND NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_attendees a
      WHERE a.meeting_id = p_meeting_id AND a.user_id = mp.user_id)
  ON CONFLICT (meeting_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_participant_count = ROW_COUNT;

  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  SELECT p_meeting_id, ur.user_id,
    CASE ur.role WHEN 'visionary' THEN 'visionary' WHEN 'integrator' THEN 'integrator' ELSE 'core_team' END,
    'invited', NOW(), NOW()
  FROM public.eos_user_roles ur
  INNER JOIN public.users u ON u.user_uuid = ur.user_id
  WHERE ur.tenant_id = v_meeting.tenant_id
    AND u.is_vivacity_internal = true
    AND COALESCE(u.disabled, false) = false
    AND COALESCE(u.archived, false) = false
    AND COALESCE(u.kpi_pod, '') <> 'qa'
    AND NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_attendees a
      WHERE a.meeting_id = p_meeting_id AND a.user_id = ur.user_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
  SELECT p_meeting_id, u.user_uuid, 'core_team', 'invited', NOW(), NOW()
  FROM public.users u
  WHERE v_meeting.tenant_id = 6372
    AND u.is_vivacity_internal = true
    AND COALESCE(u.disabled, false) = false
    AND COALESCE(u.archived, false) = false
    AND COALESCE(u.kpi_pod, '') <> 'qa'
    AND NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_attendees a
      WHERE a.meeting_id = p_meeting_id AND a.user_id = u.user_uuid)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_vivacity_count = ROW_COUNT;

  RETURN v_participant_count + v_inserted_count + v_vivacity_count;
END;
$function$;

create or replace function public.generate_series_instances(p_series_id uuid, p_weeks_ahead integer DEFAULT 12)
returns table(meeting_id uuid, scheduled_date timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_series         RECORD;
  v_next_date      DATE;
  v_end_date       DATE;
  v_meeting_id     UUID;
  v_scheduled_date TIMESTAMPTZ;
  v_count          INTEGER := 0;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO v_series FROM eos_meeting_series WHERE id = p_series_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Series not found: %', p_series_id;
  END IF;
  CASE v_series.recurrence_type
    WHEN 'weekly'    THEN v_end_date := CURRENT_DATE + (p_weeks_ahead * INTERVAL '1 week')::INTERVAL;
    WHEN 'quarterly' THEN v_end_date := CURRENT_DATE + INTERVAL '1 year';
    WHEN 'annual'    THEN v_end_date := CURRENT_DATE + INTERVAL '2 years';
    ELSE                  v_end_date := CURRENT_DATE + INTERVAL '1 day';
  END CASE;
  v_next_date := GREATEST(v_series.start_date, CURRENT_DATE);
  IF v_series.recurrence_type = 'weekly' THEN
    WHILE EXTRACT(DOW FROM v_next_date) != EXTRACT(DOW FROM v_series.start_date) LOOP
      v_next_date := v_next_date + INTERVAL '1 day';
    END LOOP;
  END IF;
  WHILE v_next_date <= v_end_date LOOP
    IF NOT EXISTS (
      SELECT 1 FROM eos_meetings m
      WHERE m.series_id = p_series_id AND DATE(m.scheduled_date) = v_next_date
    ) THEN
      INSERT INTO eos_meetings (
        tenant_id, series_id, meeting_type, title, scheduled_date,
        duration_minutes, location, template_id, template_version_id,
        status, created_by, workspace_id, meeting_scope
      )
      SELECT
        v_series.tenant_id, v_series.id, v_series.meeting_type,
        v_series.title || ' - ' || to_char(v_next_date, 'Mon DD, YYYY'),
        v_next_date + v_series.start_time,
        v_series.duration_minutes, v_series.location,
        v_series.agenda_template_id, v_series.agenda_template_version_id,
        'scheduled',
        v_series.created_by, v_series.workspace_id,
        CASE WHEN v_series.workspace_id IS NOT NULL THEN 'vivacity_team' ELSE NULL END
      RETURNING id, eos_meetings.scheduled_date INTO v_meeting_id, v_scheduled_date;
      meeting_id     := v_meeting_id;
      scheduled_date := v_scheduled_date;
      v_count        := v_count + 1;
      RETURN NEXT;
    END IF;
    CASE v_series.recurrence_type
      WHEN 'weekly'    THEN v_next_date := v_next_date + INTERVAL '1 week';
      WHEN 'quarterly' THEN v_next_date := v_next_date + INTERVAL '3 months';
      WHEN 'annual'    THEN v_next_date := v_next_date + INTERVAL '1 year';
      ELSE EXIT;
    END CASE;
  END LOOP;
  RETURN;
END;
$function$;

create or replace function public.create_meeting_basic(p_tenant_id bigint, p_meeting_type text, p_title text, p_scheduled_date timestamp with time zone, p_facilitator_id uuid DEFAULT NULL::uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_meeting_id UUID;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  INSERT INTO eos_meetings (
    tenant_id, meeting_type, title, scheduled_date, facilitator_id, status, created_by
  ) VALUES (
    p_tenant_id, p_meeting_type, p_title, p_scheduled_date,
    COALESCE(p_facilitator_id, auth.uid()), 'scheduled', auth.uid()
  )
  RETURNING id INTO v_meeting_id;

  IF p_meeting_type = 'L10' THEN
    INSERT INTO eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order) VALUES
      (v_meeting_id, 'Segue', 5, 1), (v_meeting_id, 'Scorecard', 5, 2),
      (v_meeting_id, 'Rock Review', 5, 3), (v_meeting_id, 'Headlines', 5, 4),
      (v_meeting_id, 'To-Do List', 5, 5), (v_meeting_id, 'IDS', 60, 6),
      (v_meeting_id, 'Conclude', 5, 7);
  ELSIF p_meeting_type = 'Quarterly' THEN
    INSERT INTO eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order) VALUES
      (v_meeting_id, 'Segue', 10, 1), (v_meeting_id, 'Review Previous Flight Plan', 30, 2),
      (v_meeting_id, 'Review Mission Control', 30, 3), (v_meeting_id, 'Establish Next Quarter Rocks', 60, 4),
      (v_meeting_id, 'Tackle Key Issues', 60, 5), (v_meeting_id, 'Next Steps', 20, 6),
      (v_meeting_id, 'Conclude', 10, 7);
  ELSIF p_meeting_type = 'Annual' THEN
    INSERT INTO eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order) VALUES
      (v_meeting_id, 'Day 1: Segue', 15, 1), (v_meeting_id, 'Day 1: Review Previous Mission Control', 60, 2),
      (v_meeting_id, 'Day 1: Team Health', 45, 3), (v_meeting_id, 'Day 1: SWOT/Issues List', 60, 4),
      (v_meeting_id, 'Day 1: Review Mission Control', 90, 5), (v_meeting_id, 'Day 2: Establish Next Quarter Rocks', 60, 6),
      (v_meeting_id, 'Day 2: Tackle Key Issues', 90, 7), (v_meeting_id, 'Day 2: Conclude', 20, 8);
  ELSIF p_meeting_type = 'Same_Page' THEN
    INSERT INTO eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order) VALUES
      (v_meeting_id, 'Check-In', 10, 1), (v_meeting_id, 'Review V/TO', 20, 2),
      (v_meeting_id, 'Clarify Roles and Ownership', 20, 3), (v_meeting_id, 'Discuss Key Issues', 40, 4),
      (v_meeting_id, 'Align on Priorities', 20, 5), (v_meeting_id, 'Decisions and Next Steps', 10, 6);
  END IF;

  RETURN v_meeting_id;
END;
$function$;

create or replace function public.create_meeting_basic(p_tenant_id integer, p_title text, p_meeting_type text, p_scheduled_date timestamp with time zone, p_duration_minutes integer, p_facilitator_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_meeting_id uuid;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  INSERT INTO public.eos_meetings (
    tenant_id, title, meeting_type, scheduled_date, duration_minutes, created_by, is_complete
  ) VALUES (
    p_tenant_id, p_title, p_meeting_type, p_scheduled_date, p_duration_minutes, p_facilitator_id, false
  )
  RETURNING id INTO v_meeting_id;

  INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role, attended)
  VALUES (v_meeting_id, p_facilitator_id, 'Leader', false);

  RETURN v_meeting_id;
END;
$function$;

create or replace function public.create_meeting_from_template(p_tenant_id bigint, p_agenda_template_id uuid, p_title text, p_scheduled_date timestamp with time zone, p_duration_minutes integer, p_facilitator_id uuid, p_scribe_id uuid DEFAULT NULL::uuid, p_participant_ids uuid[] DEFAULT '{}'::uuid[])
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
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

create or replace function public.create_meeting_from_template(p_template_id uuid, p_scheduled_date timestamp with time zone, p_scheduled_end_time timestamp with time zone, p_facilitator_id uuid, p_scribe_id uuid, p_location text DEFAULT NULL::text, p_participant_ids uuid[] DEFAULT NULL::uuid[], p_title text DEFAULT NULL::text, p_series_id uuid DEFAULT NULL::uuid, p_tenant_id bigint DEFAULT NULL::bigint)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_meeting_id uuid;
  v_template_name text;
  v_template_type text;
  v_meeting_type text;
  v_meeting_scope text;
  v_duration_minutes integer;
  v_agenda_json jsonb;
  v_tenant_id bigint;
  v_is_level10 boolean := false;
  v_segment jsonb;
  v_sequence integer := 1;
  v_seg_name text;
  v_seg_duration integer;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT template_name, template_type::text, duration_minutes, segments, tenant_id,
         COALESCE(meeting_scope, 'tenant')
  INTO v_template_name, v_template_type, v_duration_minutes, v_agenda_json, v_tenant_id, v_meeting_scope
  FROM public.eos_agenda_templates
  WHERE id = p_template_id;

  IF v_template_name IS NULL THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;

  IF p_tenant_id IS NOT NULL THEN v_tenant_id := p_tenant_id; END IF;

  v_meeting_type := COALESCE(v_template_type, v_template_name);
  v_is_level10 := (v_meeting_type ILIKE '%L10%' OR v_meeting_type ILIKE '%level%10%' OR v_template_name ILIKE '%level%10%');

  INSERT INTO public.eos_meetings (
    tenant_id, template_id, title, meeting_type, meeting_scope,
    scheduled_date, scheduled_end_time, duration_minutes,
    facilitator_id, scribe_id, location, agenda, status, series_id
  ) VALUES (
    v_tenant_id, p_template_id,
    COALESCE(p_title, v_template_name || ' - ' || to_char(p_scheduled_date, 'YYYY-MM-DD')),
    v_meeting_type, v_meeting_scope,
    p_scheduled_date, p_scheduled_end_time, v_duration_minutes,
    p_facilitator_id, p_scribe_id, p_location, v_agenda_json, 'scheduled', p_series_id
  ) RETURNING id INTO v_meeting_id;

  IF v_agenda_json IS NOT NULL AND jsonb_array_length(v_agenda_json) > 0 THEN
    FOR v_segment IN SELECT * FROM jsonb_array_elements(v_agenda_json)
    LOOP
      v_seg_name := COALESCE(v_segment->>'segment_name', v_segment->>'name', 'Untitled Segment');
      v_seg_duration := COALESCE((v_segment->>'duration_minutes')::INT, (v_segment->>'duration')::INT, 5);
      INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
        VALUES (v_meeting_id, v_seg_name, v_seg_duration, v_sequence);
      v_sequence := v_sequence + 1;
    END LOOP;
  END IF;

  INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
  VALUES (v_meeting_id, p_facilitator_id, 'Leader')
  ON CONFLICT (meeting_id, user_id) DO NOTHING;

  IF p_scribe_id IS DISTINCT FROM p_facilitator_id THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_scribe_id, 'Member')
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;

  IF v_is_level10 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, u.user_uuid, 'Member'
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.is_vivacity_internal = true
      AND u.archived = false
      AND u.user_uuid IS NOT NULL
      AND u.user_uuid IS DISTINCT FROM p_facilitator_id
      AND u.user_uuid IS DISTINCT FROM p_scribe_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  ELSE
    IF p_participant_ids IS NOT NULL AND array_length(p_participant_ids, 1) > 0 THEN
      INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
      SELECT v_meeting_id, pid, 'Member'
      FROM unnest(p_participant_ids) AS pid
      WHERE pid IS DISTINCT FROM p_facilitator_id AND pid IS DISTINCT FROM p_scribe_id
      ON CONFLICT (meeting_id, user_id) DO NOTHING;
    END IF;
  END IF;

  PERFORM public.seed_meeting_attendees_from_roles(v_meeting_id);
  RETURN v_meeting_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
