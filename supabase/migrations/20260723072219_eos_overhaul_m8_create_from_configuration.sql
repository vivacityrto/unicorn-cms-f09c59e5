-- ============================================================
-- EOS Meeting Overhaul — Migration 8 (Create-from-Configuration RPC)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md,
-- 2026-07-23). Apply in the 22:00-04:00 AEST off-peak window per
-- project convention (new function only, no existing object touched -
-- low risk, but keeping the same discipline as the rest of this series).
--
-- Supports Stage 2 (Create Meeting simplification): for the four fixed
-- meeting types, scheduling collapses to type + date, deriving
-- everything else from that type's Configuration.
--
-- Gap found and closed here, not anticipated in the original plan:
-- tenant 6372 has an eos_meeting_series row for L10 only (confirmed
-- live during M2's investigation - Quarterly/Annual/Same_Page have
-- none). auto_generate_next_meeting (M6) only continues a cadence for
-- a meeting linked to an active series - without one, "type + date"
-- scheduling would work for the first Quarterly/Annual meeting but
-- never auto-continue. This RPC creates the missing series lazily, the
-- first time each type is ever scheduled through it - not via a
-- separate backfill, since Configuration-derived scheduling is the
-- only path that needs one going forward.
--
-- Same_Page (frequency = on_demand) deliberately gets no series -
-- eos_meeting_series.recurrence_type's CHECK constraint doesn't even
-- have an 'on_demand' value (confirmed live: only
-- one_time/weekly/quarterly/annual), matching its design as a one-off,
-- not a recurring cadence.
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

  INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
  SELECT v_meeting_id, cs.label, cs.duration_minutes, cs.sequence_order
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

REVOKE ALL ON FUNCTION public.create_meeting_from_configuration(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_meeting_from_configuration(text, timestamptz) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
