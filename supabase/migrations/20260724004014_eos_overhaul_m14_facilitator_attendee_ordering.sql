-- ============================================================
-- EOS Meeting Overhaul — Migration 14 (facilitator/attendee insert ordering)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md,
-- 2026-07-23). Apply in the 22:00-04:00 AEST off-peak window per
-- project convention.
--
-- Gap found by Cursor Bugbot review on PR #39 (round 6). Re-CREATE OR
-- REPLACE each function verbatim from its current live body plus the
-- fix below - never amending already-committed migrations, per this
-- branch's established discipline.
--
-- create_meeting_from_configuration() and auto_generate_next_meeting()
-- both INSERT the eos_meetings row first (firing seed_meeting_attendees'
-- AFTER INSERT trigger immediately) and only insert the resolved
-- facilitator's eos_meeting_participants ('Leader') row afterward, in a
-- later statement in the same function. seed_meeting_attendees' final
-- "mirror whoever's already in eos_meeting_participants" branch runs
-- against an empty participants set at that point, so it can never
-- catch the facilitator for a brand-new meeting created via either
-- path - not just a mislabeling (attendee vs owner), which is all a
-- prior investigation this session assumed, but a real absence for
-- required_seats Configurations whose facilitator seat isn't itself one
-- of the required seats. Start Meeting is gated on attendee membership
-- (canStartMeeting requires it), so the facilitator could end up locked
-- out of starting their own meeting. Fixed by explicitly upserting the
-- facilitator's attendee row (role_in_meeting = 'owner') right after
-- their participant row is inserted in both functions, rather than
-- relying on the trigger to catch it after the fact.
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

      -- seed_meeting_attendees already fired on the eos_meetings insert
      -- above, before this row existed, so its participant-mirror branch
      -- can't catch the facilitator - upsert their attendee row directly.
      INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status)
      VALUES (v_meeting_id, v_facilitator_user_id, 'owner', 'invited')
      ON CONFLICT (meeting_id, user_id) DO UPDATE SET role_in_meeting = 'owner';
    END IF;
  END IF;

  INSERT INTO public.audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
  VALUES (6372, 'meeting', v_meeting_id, 'meeting_created_from_configuration', auth.uid(),
    jsonb_build_object('configuration_id', v_config.id, 'series_id', v_series_id, 'meeting_type', p_meeting_type));

  RETURN v_meeting_id;
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

  SELECT * INTO v_config
  FROM public.eos_configurations
  WHERE tenant_id = NEW.tenant_id AND meeting_type = NEW.meeting_type;

  IF v_config.id IS NOT NULL THEN
    CASE v_config.frequency
      WHEN 'weekly'    THEN v_next_date := NEW.scheduled_date + interval '7 days';
      WHEN 'quarterly' THEN v_next_date := NEW.scheduled_date + interval '3 months';
      WHEN 'annual'    THEN v_next_date := NEW.scheduled_date + interval '1 year';
      ELSE v_next_date := NULL;
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

        -- seed_meeting_attendees already fired on the eos_meetings insert
        -- above, before this row existed, so its participant-mirror
        -- branch can't catch the facilitator - upsert directly.
        INSERT INTO public.eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status)
        VALUES (v_next_meeting_id, v_facilitator_user_id, 'owner', 'invited')
        ON CONFLICT (meeting_id, user_id) DO UPDATE SET role_in_meeting = 'owner';
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

NOTIFY pgrst, 'reload schema';

COMMIT;
