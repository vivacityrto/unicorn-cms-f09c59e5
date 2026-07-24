-- ============================================================
-- Rollback for 20260724000924_eos_overhaul_m10_scheduling_rpc_permission_check.sql
-- Restores create_meeting_from_configuration, sync_meeting_to_configuration,
-- and skip_meeting_occurrence to their pre-M10 bodies (M9/M6 versions,
-- is_vivacity_team_safe check only, no has_permission check).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_meeting_from_configuration(p_meeting_type text, p_scheduled_date timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_config RECORD;
  v_series_id uuid;
  v_meeting_id uuid;
  v_facilitator_user_id uuid;
  v_total_duration int;
  v_title text;
  v_recurrence_type text;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO v_config FROM public.eos_configurations
  WHERE tenant_id = 6372 AND meeting_type = p_meeting_type;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No Configuration exists for meeting type %', p_meeting_type;
  END IF;

  v_recurrence_type := CASE v_config.frequency
    WHEN 'weekly' THEN 'weekly'
    WHEN 'quarterly' THEN 'quarterly'
    WHEN 'annual' THEN 'annual'
    ELSE NULL
  END;

  IF v_recurrence_type IS NOT NULL THEN
    SELECT id INTO v_series_id FROM public.eos_meeting_series
    WHERE tenant_id = 6372 AND meeting_type = p_meeting_type AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.eos_meeting_series (tenant_id, meeting_type, title, recurrence_type, start_date, is_active, created_by)
      VALUES (6372, p_meeting_type, p_meeting_type || ' Series', v_recurrence_type, p_scheduled_date::date, true, auth.uid())
      RETURNING id INTO v_series_id;
    END IF;
  END IF;

  SELECT COALESCE(SUM(duration_minutes), 90) INTO v_total_duration
  FROM public.eos_configuration_segments WHERE configuration_id = v_config.id;

  v_title := p_meeting_type || ' - ' || to_char(p_scheduled_date, 'DD Mon YYYY');

  INSERT INTO public.eos_meetings (tenant_id, title, meeting_type, scheduled_date, duration_minutes, series_id, status, created_by)
  VALUES (6372, v_title, p_meeting_type, p_scheduled_date, v_total_duration, v_series_id, 'scheduled', auth.uid())
  RETURNING id INTO v_meeting_id;

  INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, segment_type, duration_minutes, sequence_order)
  SELECT v_meeting_id, cs.label, cs.segment_type, cs.duration_minutes, cs.sequence_order
  FROM public.eos_configuration_segments cs
  WHERE cs.configuration_id = v_config.id
  ORDER BY cs.sequence_order;

  IF v_config.facilitator_seat_id IS NOT NULL THEN
    SELECT user_id INTO v_facilitator_user_id
    FROM public.accountability_seat_assignments
    WHERE seat_id = v_config.facilitator_seat_id
      AND assignment_type = 'Primary'
      AND start_date <= CURRENT_DATE
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
    ORDER BY start_date DESC
    LIMIT 1;

    IF v_facilitator_user_id IS NOT NULL THEN
      INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
      VALUES (v_meeting_id, v_facilitator_user_id, 'Leader')
      ON CONFLICT (meeting_id, user_id) DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
  VALUES (6372, 'meeting', v_meeting_id, 'meeting_created_from_configuration', auth.uid(),
    jsonb_build_object('configuration_id', v_config.id, 'series_id', v_series_id, 'meeting_type', p_meeting_type));

  RETURN v_meeting_id;
END;
$function$;

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

    IF v_facilitator_user_id IS NOT NULL THEN
      UPDATE public.eos_meeting_participants SET role = 'Member'
      WHERE meeting_id = p_meeting_id AND role = 'Leader' AND user_id <> v_facilitator_user_id;

      INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
      VALUES (p_meeting_id, v_facilitator_user_id, 'Leader')
      ON CONFLICT (meeting_id, user_id) DO UPDATE SET role = 'Leader';
    END IF;
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
  END IF;

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

CREATE OR REPLACE FUNCTION public.skip_meeting_occurrence(p_meeting_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_meeting RECORD;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  IF v_meeting.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Can only skip a meeting that is still scheduled';
  END IF;

  UPDATE public.eos_meetings
  SET status = 'skipped', updated_at = now()
  WHERE id = p_meeting_id;

  INSERT INTO public.audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
  VALUES (v_meeting.tenant_id, 'meeting', p_meeting_id, 'meeting_skipped', auth.uid(),
    jsonb_build_object('reason', p_reason));

  RETURN p_meeting_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
