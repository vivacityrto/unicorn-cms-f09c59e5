-- ============================================================
-- EOS Meeting Overhaul — Migration 6 (Behavior fixes)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md,
-- 2026-07-23). Rewrites RPCs/triggers. Apply in the 22:00-04:00 AEST
-- off-peak window per project convention (trigger recreation takes a
-- brief ACCESS EXCLUSIVE lock on eos_meetings).
--
-- Every function below hardened per project convention: SECURITY
-- DEFINER, SET search_path = '' (was 'public' on every one of these
-- live today), every object reference fully schema-qualified, REVOKE
-- ALL FROM PUBLIC + explicit GRANT to authenticated/service_role.
--
-- Live verification before writing this file (see PR description for
-- full trail):
--   - Facilitator seat -> person resolution: accountability_seats has
--     NO owner column; the actual seat-holder mapping lives in
--     accountability_seat_assignments (seat_id, user_id, assignment_type,
--     start_date, end_date). Only assignment_type='Primary' exists today.
--   - Whole-roster derivation uses the existing get_vivacity_team_directory_staff()
--     RPC verbatim (kpi_pod<>'qa' exclusion kept as-is per Carl's decision,
--     2026-07-23).
--   - A SECOND, unrelated recurrence system (eos_meeting_recurrences /
--     eos_meeting_occurrences / generate-meeting-recurrence edge function /
--     cancel_occurrence / cancel_recurrence_series) was discovered and
--     investigated. Verdict: write-only dead end for tenant 6372 today —
--     MeetingScheduler.tsx still writes to it, but its only reader
--     component is unmounted, nothing advances it automatically, and its
--     occurrence rows never back-link a meeting_id so its cancel RPCs can
--     never touch eos_meetings. It is NOT integrated with here — the real
--     cadence runs entirely on eos_meeting_series + auto_generate_next_meeting.
--     Decommissioning that parallel system is a separate decision, not
--     part of this migration.
--   - Correction to M1: 'skipped' was added to eos_meeting_occurrences'
--     status CHECK based on an assumption that table was load-bearing for
--     recurrence. It isn't (see above) — the real skip mechanism below
--     targets eos_meetings.status instead, which has NO CHECK constraint
--     at all (confirmed live), so no schema change was needed for it.
--     M1's addition is harmless residue, left as-is rather than spending
--     a migration reverting something inert.
--   - close_meeting_with_validation's actual_duration_minutes calculation
--     mirrors complete_meeting_instance's exact existing expression
--     verbatim (EXTRACT(EPOCH FROM (now() - started_at)) / 60, falling
--     back to duration_minutes if never started) rather than inventing a
--     new one.
--   - advance_segment's live bypass was broader than assumed (Leader OR
--     super_admin OR Vivacity-internal Integrator/Team Leader) —
--     go_to_previous_segment's was narrower (Leader OR super_admin only).
--     Both collapse to Leader-only here, matching the plan's resolved
--     "no super-admin bypass anywhere in this tier" model.
--   - change_meeting_facilitator and apply_template_to_meeting are
--     deliberately NOT touched here: the former already correctly
--     implements the Leader/super-admin/Integrator-or-above handoff model;
--     the latter's old frontend caller (ApplyTemplateDialog) still needs
--     it to keep working until Stage 2's frontend rebuild replaces the
--     calling code — dropping or changing it now would break the current
--     flag-off UI path.
-- ============================================================

BEGIN;

-- 1. auto_generate_next_meeting — derive title/agenda/facilitator instead
--    of copying forward; also advance on 'skipped' (new), not just
--    closed/completed.
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

  -- Title regenerated from the new date, never copied verbatim (fixes the
  -- "20 Jul" titled meeting actually scheduled for 27 Jul bug).
  v_next_title := NEW.meeting_type || ' - ' || to_char(v_next_date, 'DD Mon YYYY');

  -- Derive from this tenant/type's Configuration when one exists
  -- (self-healing - a bad prior occurrence can't propagate forward).
  -- Falls back to the old copy-forward behavior when no Configuration
  -- exists (every tenant outside 6372 today), so nothing outside this
  -- overhaul's scope regresses.
  SELECT * INTO v_config
  FROM public.eos_configurations
  WHERE tenant_id = NEW.tenant_id AND meeting_type = NEW.meeting_type;

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
    INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
    SELECT v_next_meeting_id, cs.label, cs.duration_minutes, cs.sequence_order
    FROM public.eos_configuration_segments cs
    WHERE cs.configuration_id = v_config.id
    ORDER BY cs.sequence_order;

    GET DIAGNOSTICS v_copied_count = ROW_COUNT;

    -- Facilitator resolved from the Configuration's seat and written as a
    -- real Leader participant row - a deliberate snapshot (who actually
    -- held the seat at generation time is a fact worth keeping).
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
    -- No Configuration for this tenant/type - preserve prior copy-forward
    -- behavior rather than leaving the meeting with no agenda at all.
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

REVOKE ALL ON FUNCTION public.auto_generate_next_meeting() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_generate_next_meeting() TO postgres, service_role;

-- 2. seed_meeting_attendees — derive fresh from the Configuration's
--    participant model instead of copying attendee rows forward from
--    every prior meeting in the series.
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
    IF v_config.participant_model = 'required_seats' THEN
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

REVOKE ALL ON FUNCTION public.seed_meeting_attendees() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_meeting_attendees() TO postgres, service_role;

-- 3. New: sync_meeting_to_configuration - "Sync to Configuration" replaces
--    "Apply Template" conceptually. Guarded to scheduled-only so it can
--    never rewind a live meeting's progress (delete+reinsert of segments
--    wipes started_at/completed_at and segment notes).
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

  INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
  SELECT p_meeting_id, cs.label, cs.duration_minutes, cs.sequence_order
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
  -- whole_roster participants are computed live at render time (Stage 2),
  -- not stored - nothing to insert here for that case.

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

REVOKE ALL ON FUNCTION public.sync_meeting_to_configuration(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_meeting_to_configuration(uuid) TO authenticated, service_role;

-- 4. New: skip_meeting_occurrence - marks a scheduled meeting 'skipped'
--    (distinct from closed/completed, so history stays honest) while still
--    advancing the cadence via auto_generate_next_meeting's widened gate
--    above. Targets eos_meetings.status directly (no CHECK constraint on
--    that column - confirmed live, no schema change needed).
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

REVOKE ALL ON FUNCTION public.skip_meeting_occurrence(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.skip_meeting_occurrence(uuid, text) TO authenticated, service_role;

-- 5. close_meeting_with_validation(uuid, boolean) - quorum/ratings now
--    genuinely gate closing (was warnings-only); actual_duration_minutes
--    computed using complete_meeting_instance's existing expression
--    verbatim. Facilitator gate and the started-based force-close
--    exception are unchanged (already correct, confirmed live).
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

  -- Quorum/ratings now genuinely gate closing unless forced, matching what
  -- the close dialog's UI has always implied. p_force stays facilitator-only
  -- - same person/role as a normal close, no escalated permission for it.
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

REVOKE ALL ON FUNCTION public.close_meeting_with_validation(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_meeting_with_validation(uuid, boolean) TO authenticated, service_role;

-- 6. advance_segment - facilitator (Leader) only, full stop. Removes BOTH
--    the super-admin bypass AND the broader Integrator/Team-Leader
--    Vivacity-internal bypass that existed live (broader than the plan's
--    original description assumed).
CREATE OR REPLACE FUNCTION public.advance_segment(p_meeting_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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

  IF v_meeting.role IS DISTINCT FROM 'Leader' THEN
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

REVOKE ALL ON FUNCTION public.advance_segment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_segment(uuid) TO authenticated, service_role;

-- 7. go_to_previous_segment - facilitator (Leader) only, full stop.
--    Removes the super-admin bypass that existed live.
CREATE OR REPLACE FUNCTION public.go_to_previous_segment(p_meeting_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_current_segment RECORD;
  v_previous_segment RECORD;
  v_meeting RECORD;
BEGIN
  SELECT m.*, emp.role INTO v_meeting
  FROM public.eos_meetings m
  LEFT JOIN public.eos_meeting_participants emp
    ON emp.meeting_id = m.id AND emp.user_id = auth.uid()
  WHERE m.id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  IF v_meeting.role IS DISTINCT FROM 'Leader' THEN
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
    jsonb_build_object('from_segment', v_current_segment.id, 'to_segment', v_previous_segment.id)
  );

  RETURN v_previous_segment.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.go_to_previous_segment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.go_to_previous_segment(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
