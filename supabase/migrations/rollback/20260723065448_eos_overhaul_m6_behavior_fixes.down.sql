-- ============================================================
-- Rollback for 20260723065448_eos_overhaul_m6_behavior_fixes.sql
-- Restores each function's exact pre-migration body (captured live before
-- this migration ran) and drops the two newly-added functions.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.skip_meeting_occurrence(uuid, text);
DROP FUNCTION IF EXISTS public.sync_meeting_to_configuration(uuid);

CREATE OR REPLACE FUNCTION public.go_to_previous_segment(p_meeting_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  SELECT * INTO v_current_segment
  FROM public.eos_meeting_segments
  WHERE meeting_id = p_meeting_id
    AND started_at IS NOT NULL
    AND completed_at IS NULL;

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

  IF v_current_segment.id IS NOT NULL THEN
    UPDATE public.eos_meeting_segments
    SET started_at = NULL
    WHERE id = v_current_segment.id;
  END IF;

  UPDATE public.eos_meeting_segments
  SET completed_at = NULL
  WHERE id = v_previous_segment.id;

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
$function$;

CREATE OR REPLACE FUNCTION public.advance_segment(p_meeting_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_segment UUID;
  v_next_segment UUID;
  v_meeting RECORD;
BEGIN
  SELECT m.*, emp.role INTO v_meeting
  FROM public.eos_meetings m
  LEFT JOIN public.eos_meeting_participants emp ON emp.meeting_id = m.id AND emp.user_id = auth.uid()
  WHERE m.id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  IF v_meeting.role != 'Leader'
     AND NOT is_super_admin()
     AND NOT EXISTS (
       SELECT 1 FROM public.users
       WHERE user_uuid = auth.uid()
         AND unicorn_role IN ('Integrator', 'Team Leader')
         AND is_vivacity_internal = true
     )
  THEN
    RAISE EXCEPTION 'Only facilitator can advance segments';
  END IF;

  UPDATE public.eos_meeting_segments
  SET completed_at = now()
  WHERE meeting_id = p_meeting_id
    AND started_at IS NOT NULL
    AND completed_at IS NULL
  RETURNING id INTO v_current_segment;

  UPDATE public.eos_meeting_segments
  SET started_at = now()
  WHERE meeting_id = p_meeting_id
    AND started_at IS NULL
    AND sequence_order = (
      SELECT MIN(sequence_order)
      FROM public.eos_meeting_segments
      WHERE meeting_id = p_meeting_id
        AND started_at IS NULL
    )
  RETURNING id INTO v_next_segment;

  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, meeting_id, entity, entity_id, action, details
  ) VALUES (
    v_meeting.tenant_id, auth.uid(), p_meeting_id, 'segment', v_next_segment, 'advanced',
    jsonb_build_object('from_segment', v_current_segment, 'to_segment', v_next_segment)
  );

  RETURN v_next_segment;
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
  v_participant_count INTEGER;
BEGIN
  v_current_user_id := auth.uid();
  SELECT m.*, t.id as tid INTO v_meeting FROM public.eos_meetings m JOIN public.tenants t ON t.id = m.tenant_id WHERE m.id = p_meeting_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Meeting not found'); END IF;
  v_tenant_id := v_meeting.tid;

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

CREATE OR REPLACE FUNCTION public.seed_meeting_attendees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.series_id IS NOT NULL THEN
    INSERT INTO eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status)
    SELECT NEW.id, a.user_id, a.role_in_meeting, 'invited'
    FROM eos_meeting_attendees a JOIN eos_meetings m ON m.id = a.meeting_id
    WHERE m.series_id = NEW.series_id AND m.id != NEW.id
    GROUP BY a.user_id, a.role_in_meeting
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;

  INSERT INTO eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status)
  SELECT NEW.id, p.user_id,
    CASE WHEN p.role = 'Leader' THEN 'owner'::text ELSE 'attendee'::text END, 'invited'
  FROM eos_meeting_participants p WHERE p.meeting_id = NEW.id
  ON CONFLICT (meeting_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_generate_next_meeting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_series RECORD;
  v_next_date timestamptz;
  v_next_meeting_id uuid;
  v_copied_count int := 0;
BEGIN
  -- Only proceed if status changed to closed or completed
  IF NEW.status NOT IN ('closed', 'completed') OR OLD.status IN ('closed', 'completed') THEN
    RETURN NEW;
  END IF;

  IF NEW.series_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_series
  FROM public.eos_meeting_series
  WHERE id = NEW.series_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  CASE v_series.recurrence_type
    WHEN 'weekly'    THEN v_next_date := NEW.scheduled_date + interval '7 days';
    WHEN 'biweekly'  THEN v_next_date := NEW.scheduled_date + interval '14 days';
    WHEN 'monthly'   THEN v_next_date := NEW.scheduled_date + interval '1 month';
    WHEN 'quarterly' THEN v_next_date := NEW.scheduled_date + interval '3 months';
    WHEN 'annual'    THEN v_next_date := NEW.scheduled_date + interval '1 year';
    ELSE RETURN NEW;
  END CASE;

  IF EXISTS (
    SELECT 1 FROM public.eos_meetings
    WHERE series_id = NEW.series_id
      AND scheduled_date::date = v_next_date::date
      AND id != NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.eos_meetings (
    tenant_id, title, meeting_type, scheduled_date, duration_minutes,
    series_id, status, workspace_id, meeting_scope, previous_meeting_id, created_by,
    template_id, template_version_id
  )
  VALUES (
    NEW.tenant_id, NEW.title, NEW.meeting_type, v_next_date, NEW.duration_minutes,
    NEW.series_id, 'scheduled', NEW.workspace_id, NEW.meeting_scope, NEW.id, NEW.created_by,
    NEW.template_id, NEW.template_version_id
  )
  RETURNING id INTO v_next_meeting_id;

  UPDATE public.eos_meetings SET next_meeting_id = v_next_meeting_id WHERE id = NEW.id;

  IF NEW.template_id IS NOT NULL
     AND (SELECT COUNT(*) FROM public.eos_meeting_segments WHERE meeting_id = v_next_meeting_id) = 0
  THEN
    INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
    SELECT v_next_meeting_id, segment_name, duration_minutes, sequence_order
    FROM public.eos_meeting_segments
    WHERE meeting_id = NEW.id;

    GET DIAGNOSTICS v_copied_count = ROW_COUNT;

    IF v_copied_count > 0 THEN
      INSERT INTO public.audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
      VALUES (
        NEW.tenant_id, 'meeting', v_next_meeting_id,
        'meeting_segments_copied', auth.uid(),
        jsonb_build_object(
          'source_meeting_id', NEW.id,
          'target_meeting_id', v_next_meeting_id,
          'segments_copied', v_copied_count
        )
      );
    END IF;
  END IF;

  INSERT INTO public.audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
  VALUES (
    NEW.tenant_id, 'meeting', v_next_meeting_id,
    'meeting_auto_generated', auth.uid(),
    jsonb_build_object('source_meeting_id', NEW.id, 'scheduled_date', v_next_date)
  );

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
