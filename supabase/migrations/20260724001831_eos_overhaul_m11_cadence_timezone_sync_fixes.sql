-- ============================================================
-- EOS Meeting Overhaul — Migration 11 (cadence, timezone, sync fixes)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md,
-- 2026-07-23). Apply in the 22:00-04:00 AEST off-peak window per
-- project convention.
--
-- Gaps found by Cursor Bugbot review on PR #39 (round 3), not
-- anticipated in the original plan. Re-CREATE OR REPLACE each function
-- verbatim from its current (M9/M10-superseded) body plus the fixes
-- below - never amending the already-committed M6/M8/M9/M10
-- migrations, per this branch's established discipline.
--
-- 1. auto_generate_next_meeting(): cadence was computed solely from
--    eos_meeting_series.recurrence_type, so editing a Configuration's
--    frequency after a series already exists had no effect on when the
--    next occurrence generates - Configuration is supposed to be the
--    single source of truth (Stage 1's whole point). Now derives cadence
--    from the Configuration's frequency when one exists, falling back to
--    the series value only when it doesn't.
-- 2. auto_generate_next_meeting(): the no-Configuration copy-forward
--    fallback (line ~156 pre-fix) omitted segment_type from its INSERT,
--    so copied segments always reset to 'general' even when the source
--    rows were correctly classified. Added to the SELECT list.
-- 3. auto_generate_next_meeting() / create_meeting_from_configuration():
--    title generation used to_char() on a timestamptz directly, which
--    formats in the DB session's timezone - confirmed live that's UTC,
--    not Sydney. An early-AEST-morning pick (before 10am AEST / 11am
--    AEDT) would title the meeting on the previous calendar day even
--    though scheduled_date itself was correct. Both now format the title
--    date via `AT TIME ZONE 'Australia/Sydney'`.
-- 4. sync_meeting_to_configuration(): the UI's "Sync to Configuration"
--    button promises a full re-derive of agenda, facilitator, and
--    participants, but the RPC only patched the Leader role and
--    inserted-without-removing required-seat participants - it never
--    touched eos_meeting_attendees at all, and had no whole_roster
--    handling whatsoever. Now fully wipes and re-derives both
--    eos_meeting_participants and eos_meeting_attendees, mirroring
--    seed_meeting_attendees()'s derivation logic exactly. Safe because
--    the function is already guarded to scheduled-only meetings (no
--    real attendance data can exist yet to lose).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_generate_next_meeting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_series RECORD;
  v_config RECORD;
  v_next_date timestamptz;
  v_next_meeting_id uuid;
  v_facilitator_user_id uuid;
  v_next_title text;
  v_copied_count int := 0;
BEGIN
  IF NEW.status NOT IN ('closed', 'completed', 'skipped') OR OLD.status IN ('closed', 'completed', 'skipped') THEN
    RETURN NEW;
  END IF;

  IF NEW.series_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_series
  FROM public.eos_meeting_series
  WHERE id = NEW.series_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Configuration.frequency is the source of truth once a Configuration
  -- exists for this tenant/type - only fall back to the series' own
  -- recurrence_type when there's no Configuration to derive it from.
  SELECT * INTO v_config
  FROM public.eos_configurations
  WHERE tenant_id = NEW.tenant_id AND meeting_type = NEW.meeting_type;

  IF v_config.id IS NOT NULL THEN
    CASE v_config.frequency
      WHEN 'weekly'    THEN v_next_date := NEW.scheduled_date + interval '7 days';
      WHEN 'quarterly' THEN v_next_date := NEW.scheduled_date + interval '3 months';
      WHEN 'annual'    THEN v_next_date := NEW.scheduled_date + interval '1 year';
      ELSE v_next_date := NULL; -- on_demand: no automatic next occurrence
    END CASE;
  ELSE
    CASE v_series.recurrence_type
      WHEN 'weekly'    THEN v_next_date := NEW.scheduled_date + interval '7 days';
      WHEN 'biweekly'  THEN v_next_date := NEW.scheduled_date + interval '14 days';
      WHEN 'monthly'   THEN v_next_date := NEW.scheduled_date + interval '1 month';
      WHEN 'quarterly' THEN v_next_date := NEW.scheduled_date + interval '3 months';
      WHEN 'annual'    THEN v_next_date := NEW.scheduled_date + interval '1 year';
      ELSE v_next_date := NULL;
    END CASE;
  END IF;

  IF v_next_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.eos_meetings
    WHERE series_id = NEW.series_id
      AND scheduled_date::date = v_next_date::date
      AND id != NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  v_next_title := NEW.meeting_type || ' - ' || to_char(v_next_date AT TIME ZONE 'Australia/Sydney', 'DD Mon YYYY');

  INSERT INTO public.eos_meetings (
    tenant_id, title, meeting_type, scheduled_date, duration_minutes,
    series_id, status, workspace_id, meeting_scope, previous_meeting_id, created_by,
    template_id, template_version_id
  )
  VALUES (
    NEW.tenant_id, v_next_title, NEW.meeting_type, v_next_date, NEW.duration_minutes,
    NEW.series_id, 'scheduled', NEW.workspace_id, NEW.meeting_scope, NEW.id, NEW.created_by,
    NEW.template_id, NEW.template_version_id
  )
  RETURNING id INTO v_next_meeting_id;

  UPDATE public.eos_meetings SET next_meeting_id = v_next_meeting_id WHERE id = NEW.id;

  IF v_config.id IS NOT NULL THEN
    INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, segment_type, duration_minutes, sequence_order)
    SELECT v_next_meeting_id, cs.label, cs.segment_type, cs.duration_minutes, cs.sequence_order
    FROM public.eos_configuration_segments cs
    WHERE cs.configuration_id = v_config.id
    ORDER BY cs.sequence_order;

    GET DIAGNOSTICS v_copied_count = ROW_COUNT;

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
        VALUES (v_next_meeting_id, v_facilitator_user_id, 'Leader')
        ON CONFLICT (meeting_id, user_id) DO NOTHING;
      END IF;
    END IF;

    IF v_copied_count > 0 THEN
      INSERT INTO public.audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
      VALUES (
        NEW.tenant_id, 'meeting', v_next_meeting_id,
        'meeting_segments_derived_from_configuration', auth.uid(),
        jsonb_build_object(
          'source_meeting_id', NEW.id, 'target_meeting_id', v_next_meeting_id,
          'configuration_id', v_config.id, 'segments_created', v_copied_count
        )
      );
    END IF;
  ELSIF NEW.template_id IS NOT NULL
     AND (SELECT COUNT(*) FROM public.eos_meeting_segments WHERE meeting_id = v_next_meeting_id) = 0
  THEN
    INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, segment_type, duration_minutes, sequence_order)
    SELECT v_next_meeting_id, segment_name, segment_type, duration_minutes, sequence_order
    FROM public.eos_meeting_segments
    WHERE meeting_id = NEW.id;

    GET DIAGNOSTICS v_copied_count = ROW_COUNT;

    IF v_copied_count > 0 THEN
      INSERT INTO public.audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
      VALUES (
        NEW.tenant_id, 'meeting', v_next_meeting_id,
        'meeting_segments_copied', auth.uid(),
        jsonb_build_object('source_meeting_id', NEW.id, 'target_meeting_id', v_next_meeting_id, 'segments_copied', v_copied_count)
      );
    END IF;
  END IF;

  INSERT INTO public.audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
  VALUES (
    NEW.tenant_id, 'meeting', v_next_meeting_id,
    'meeting_auto_generated', auth.uid(),
    jsonb_build_object('source_meeting_id', NEW.id, 'scheduled_date', v_next_date, 'source_status', NEW.status)
  );

  RETURN NEW;
END;
$function$;

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

  IF NOT public.has_permission('eos.meetings.l10.create') THEN
    RAISE EXCEPTION 'Forbidden: requires scheduling permission';
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

  v_title := p_meeting_type || ' - ' || to_char(p_scheduled_date AT TIME ZONE 'Australia/Sydney', 'DD Mon YYYY');

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

  -- Full re-derive of participants + attendees, not a patch - "Sync to
  -- Configuration" promises this (see button tooltip in EosMeetings.tsx),
  -- and the scheduled-only guard above guarantees there's no real
  -- attendance data yet to lose by wiping and rebuilding both tables.
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

  -- Mirror participants into attendees (Leader -> owner), same as the
  -- seed_meeting_attendees() creation-time trigger.
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

NOTIFY pgrst, 'reload schema';

COMMIT;
