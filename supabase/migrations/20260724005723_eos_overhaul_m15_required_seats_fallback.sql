-- ============================================================
-- EOS Meeting Overhaul — Migration 15 (required_seats empty-array fallback)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md,
-- 2026-07-23). Apply in the 22:00-04:00 AEST off-peak window per
-- project convention.
--
-- Gap found by Cursor Bugbot review on PR #39 (round 9), confirmed
-- against M2's own backfill: Same_Page's required_seat_ids was left at
-- its default empty array (M2 comment: "Same_Page's Visionary+Integrator
-- seats aren't derivable" from the live template data), and its
-- facilitator_seat_id is null too (same known gap as L10/Quarterly/
-- Annual). For the three whole_roster types this is harmless - every
-- active internal staff member becomes an attendee regardless of
-- facilitator/seat data. For Same_Page's required_seats model,
-- unnest('{}') produces zero rows, so seed_meeting_attendees() and
-- sync_meeting_to_configuration() would both create/sync a meeting with
-- literally zero attendees. canStartMeeting requires attendee
-- membership, and the client-side auto-attend mechanism only runs once
-- a meeting is already in_progress - so a Same_Page meeting could never
-- be started by anyone until Carl manually sets required_seat_ids (and
-- facilitator_seat_id) via the Stage 1 editor, a chicken-and-egg lockout
-- rather than just a missing-facilitator-label cosmetic issue.
--
-- Fix: both functions now fall back to whole_roster attendee seeding
-- when participant_model = 'required_seats' but required_seat_ids is
-- empty/null - self-healing against an incomplete Configuration rather
-- than bricking the meeting, while still respecting the required_seats
-- model exactly as before once seats are actually assigned.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.seed_meeting_attendees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_config RECORD;
BEGIN
  SELECT * INTO v_config
  FROM public.eos_configurations
  WHERE tenant_id = NEW.tenant_id AND meeting_type = NEW.meeting_type;

  IF v_config.id IS NOT NULL THEN
    IF v_config.participant_model = 'required_seats' AND COALESCE(array_length(v_config.required_seat_ids, 1), 0) > 0 THEN
      INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, seat_id)
      SELECT NEW.id, asn.user_id, 'attendee', 'invited', asn.seat_id
      FROM unnest(v_config.required_seat_ids) AS seat_id
      JOIN public.accountability_seat_assignments asn
        ON asn.seat_id = seat_id
       AND asn.assignment_type = 'Primary'
       AND asn.start_date <= CURRENT_DATE
       AND (asn.end_date IS NULL OR asn.end_date >= CURRENT_DATE)
      ON CONFLICT (meeting_id, user_id) DO NOTHING;
    ELSE
      -- whole_roster, or a required_seats Configuration whose seats
      -- haven't actually been assigned yet - fall back to the full
      -- roster so the meeting is never left with zero attendees.
      INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status)
      SELECT NEW.id, staff.user_uuid, 'attendee', 'invited'
      FROM public.get_vivacity_team_directory_staff() AS staff
      ON CONFLICT (meeting_id, user_id) DO NOTHING;
    END IF;
  ELSIF NEW.series_id IS NOT NULL THEN
    -- No Configuration for this tenant/type - preserve prior copy-forward
    -- behavior rather than leaving the meeting with no attendees at all.
    INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status)
    SELECT NEW.id, a.user_id, a.role_in_meeting, 'invited'
    FROM public.eos_meeting_attendees a JOIN public.eos_meetings m ON m.id = a.meeting_id
    WHERE m.series_id = NEW.series_id AND m.id != NEW.id
    GROUP BY a.user_id, a.role_in_meeting
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;

  -- Unchanged: mirror whoever's already in eos_meeting_participants
  -- (Leader -> owner, else -> attendee).
  INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status)
  SELECT NEW.id, p.user_id,
    CASE WHEN p.role = 'Leader' THEN 'owner'::text ELSE 'attendee'::text END, 'invited'
  FROM public.eos_meeting_participants p WHERE p.meeting_id = NEW.id
  ON CONFLICT (meeting_id, user_id) DO NOTHING;

  RETURN NEW;
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
  v_old_leader_user_id uuid;
  v_effective_leader_user_id uuid;
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

  SELECT user_id INTO v_old_leader_user_id
  FROM public.eos_meeting_participants
  WHERE meeting_id = p_meeting_id AND role = 'Leader';

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

  v_effective_leader_user_id := COALESCE(v_facilitator_user_id, v_old_leader_user_id);

  DELETE FROM public.eos_meeting_participants WHERE meeting_id = p_meeting_id AND role <> 'Leader';
  DELETE FROM public.eos_meeting_attendees WHERE meeting_id = p_meeting_id;

  IF v_facilitator_user_id IS NOT NULL AND v_facilitator_user_id IS DISTINCT FROM v_old_leader_user_id THEN
    UPDATE public.eos_meeting_participants SET role = 'Member'
    WHERE meeting_id = p_meeting_id AND role = 'Leader' AND user_id <> v_facilitator_user_id;

    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (p_meeting_id, v_facilitator_user_id, 'Leader')
    ON CONFLICT (meeting_id, user_id) DO UPDATE SET role = 'Leader';
  END IF;

  IF v_config.participant_model = 'required_seats' AND COALESCE(array_length(v_config.required_seat_ids, 1), 0) > 0 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT p_meeting_id, asn.user_id, 'Member'
    FROM unnest(v_config.required_seat_ids) AS seat_id
    JOIN public.accountability_seat_assignments asn
      ON asn.seat_id = seat_id
     AND asn.assignment_type = 'Primary'
     AND asn.start_date <= CURRENT_DATE
     AND (asn.end_date IS NULL OR asn.end_date >= CURRENT_DATE)
    WHERE asn.user_id IS DISTINCT FROM v_effective_leader_user_id
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
    -- whole_roster, or a required_seats Configuration whose seats
    -- haven't actually been assigned yet - fall back to the full
    -- roster so Sync can never leave a meeting with zero attendees.
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

NOTIFY pgrst, 'reload schema';

COMMIT;
