DO $$
DECLARE
  v_invalid_count INTEGER;
  v_row_count     INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dd_meeting_status'
  ) THEN
    RAISE EXCEPTION 'dd_meeting_status does not exist — run Migration 1 first';
  END IF;
  IF (SELECT COUNT(*) FROM public.dd_meeting_status) != 7 THEN
    RAISE EXCEPTION 'dd_meeting_status does not have 7 rows — check seed data';
  END IF;
  SELECT COUNT(*) INTO v_invalid_count
  FROM (
    SELECT DISTINCT status::text FROM public.eos_meetings
    EXCEPT
    SELECT value FROM public.dd_meeting_status
  ) t;
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'eos_meetings has % distinct status values not in dd_meeting_status', v_invalid_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'meeting_status' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'Legacy meeting_status enum not found in public schema';
  END IF;
  SELECT COUNT(*) INTO v_row_count FROM public.eos_meetings;
  RAISE NOTICE 'Pre-flight passed. eos_meetings has % rows.', v_row_count;
END $$;

-- DROP DEPENDENT VIEWS
DROP VIEW IF EXISTS public.v_client_decisions_approvals;
DROP VIEW IF EXISTS public.eos_meeting_attendance_summary;
DROP VIEW IF EXISTS public.seat_linked_data;
DROP VIEW IF EXISTS public.eos_past_meetings;
DROP VIEW IF EXISTS public.eos_upcoming_meetings;

-- DROP INDEXES
DROP INDEX IF EXISTS public.idx_quarterly_meeting_unique;
DROP INDEX IF EXISTS public.idx_eos_meetings_status;

-- ALTER COLUMN
ALTER TABLE public.eos_meetings ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.eos_meetings ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.eos_meetings ALTER COLUMN status SET DEFAULT 'scheduled'::text;
ALTER TABLE public.eos_meetings ALTER COLUMN status SET NOT NULL;

-- FOREIGN KEY
ALTER TABLE public.eos_meetings
  ADD CONSTRAINT fk_eos_meetings_status
    FOREIGN KEY (status)
    REFERENCES public.dd_meeting_status(value)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- RECREATE INDEXES
CREATE INDEX idx_eos_meetings_status
  ON public.eos_meetings USING btree (status);

CREATE UNIQUE INDEX idx_quarterly_meeting_unique
  ON public.eos_meetings (tenant_id, fiscal_year, fiscal_quarter)
  WHERE (meeting_type = 'Quarterly'::text AND status <> 'cancelled'::text);

-- RECREATE generate_series_instances (remove ::public.meeting_status cast only — all else byte-identical)
CREATE OR REPLACE FUNCTION public.generate_series_instances(
  p_series_id uuid,
  p_weeks_ahead integer DEFAULT 12
)
RETURNS TABLE(meeting_id uuid, scheduled_date timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_series         RECORD;
  v_next_date      DATE;
  v_end_date       DATE;
  v_meeting_id     UUID;
  v_scheduled_date TIMESTAMPTZ;
  v_count          INTEGER := 0;
BEGIN
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

-- RECREATE VIEWS

-- eos_past_meetings: 4 ::meeting_status casts replaced with ::text
CREATE VIEW public.eos_past_meetings AS
SELECT m.id, m.tenant_id, m.client_id, m.meeting_type, m.title, m.scheduled_date,
  m.duration_minutes, m.location, m.notes, m.scorecard_data, m.rock_reviews,
  m.headlines, m.issues_discussed, m.is_complete, m.completed_at, m.created_at,
  m.updated_at, m.created_by, m.recurrence_rule, m.recurrence_end_date,
  m.parent_meeting_id, m.is_multi_client, m.template_id, m.template_version_id,
  m.current_minutes_version_id, m.minutes_status, m.status, m.series_id,
  m.agenda_snapshot, m.actual_duration_minutes, m.started_at, m.closed_at,
  s.recurrence_type, s.title AS series_title
FROM eos_meetings m
LEFT JOIN eos_meeting_series s ON m.series_id = s.id
WHERE (m.status = ANY (ARRAY['closed'::text, 'completed'::text, 'cancelled'::text]))
   OR (m.status = 'scheduled'::text AND m.scheduled_date < CURRENT_DATE)
ORDER BY m.scheduled_date DESC;

-- eos_upcoming_meetings: 2 ::meeting_status casts replaced with ::text
CREATE VIEW public.eos_upcoming_meetings AS
SELECT m.id, m.tenant_id, m.client_id, m.meeting_type, m.title, m.scheduled_date,
  m.duration_minutes, m.location, m.notes, m.scorecard_data, m.rock_reviews,
  m.headlines, m.issues_discussed, m.is_complete, m.completed_at, m.created_at,
  m.updated_at, m.created_by, m.recurrence_rule, m.recurrence_end_date,
  m.parent_meeting_id, m.is_multi_client, m.template_id, m.template_version_id,
  m.current_minutes_version_id, m.minutes_status, m.status, m.series_id,
  m.agenda_snapshot, m.actual_duration_minutes, m.started_at, m.closed_at,
  s.recurrence_type, s.is_active AS series_is_active
FROM eos_meetings m
LEFT JOIN eos_meeting_series s ON m.series_id = s.id
WHERE (m.status = ANY (ARRAY['scheduled'::text, 'in_progress'::text]))
  AND m.scheduled_date >= CURRENT_DATE
ORDER BY m.scheduled_date;

-- seat_linked_data: 1 ::meeting_status cast replaced with ::text
CREATE VIEW public.seat_linked_data AS
SELECT s.id AS seat_id, s.tenant_id, s.seat_name, s.eos_role_type,
  sa.user_id AS primary_owner_id,
  ( SELECT count(*) FROM eos_rocks r
    WHERE r.owner_id = sa.user_id AND r.tenant_id = s.tenant_id
      AND r.status <> 'complete'::text
  ) AS active_rocks_count,
  ( SELECT count(*) FROM eos_meeting_attendees ma
    JOIN eos_meetings m ON m.id = ma.meeting_id
    WHERE ma.user_id = sa.user_id AND m.tenant_id = s.tenant_id
      AND ma.attendance_status = 'attended'::text AND m.status = 'closed'::text
  ) AS meetings_attended_count,
  ( SELECT count(*) FROM eos_meeting_attendees ma
    JOIN eos_meetings m ON m.id = ma.meeting_id
    WHERE ma.user_id = sa.user_id AND m.tenant_id = s.tenant_id
      AND ma.attendance_status = 'no_show'::text AND m.status = 'closed'::text
  ) AS meetings_missed_count
FROM accountability_seats s
LEFT JOIN accountability_seat_assignments sa
  ON sa.seat_id = s.id AND sa.assignment_type = 'Primary'::text AND sa.end_date IS NULL;

-- eos_meeting_attendance_summary: byte-identical recreate
CREATE VIEW public.eos_meeting_attendance_summary AS
SELECT m.id AS meeting_id, m.meeting_type, m.title, m.scheduled_date, m.status, m.quorum_met,
  count(a.id) FILTER (WHERE a.attendance_status = 'invited'::text
    OR (a.attendance_status = ANY (ARRAY['attended'::text, 'late'::text, 'left_early'::text, 'no_show'::text]))) AS invited_count,
  count(a.id) FILTER (WHERE a.attendance_status = ANY (ARRAY['attended'::text, 'late'::text])) AS present_count,
  count(a.id) FILTER (WHERE a.attendance_status = 'late'::text) AS late_count,
  count(a.id) FILTER (WHERE a.attendance_status = 'left_early'::text) AS left_early_count,
  count(a.id) FILTER (WHERE a.attendance_status = 'no_show'::text) AS no_show_count,
  CASE
    WHEN count(a.id) FILTER (WHERE a.attendance_status <> 'declined'::text) > 0
    THEN round(
      100.0 * count(a.id) FILTER (WHERE a.attendance_status = ANY (ARRAY['attended'::text, 'late'::text]))::numeric
      / NULLIF(count(a.id) FILTER (WHERE a.attendance_status <> 'declined'::text), 0)::numeric, 1)
    ELSE 0::numeric
  END AS attendance_rate
FROM eos_meetings m
LEFT JOIN eos_meeting_attendees a ON a.meeting_id = m.id
GROUP BY m.id;

-- v_client_decisions_approvals: byte-identical recreate
CREATE VIEW public.v_client_decisions_approvals AS
SELECT em.id AS meeting_id, em.tenant_id, t.name AS client_name,
  em.meeting_type, em.title AS meeting_title, em.scheduled_date,
  em.status AS meeting_status, em.is_complete, em.completed_at, em.quorum_met,
  (SELECT count(*) FROM eos_todos et WHERE et.meeting_id = em.id) AS todos_created,
  (SELECT count(*) FROM eos_issues ei WHERE ei.meeting_id = em.id AND ei.deleted_at IS NULL) AS issues_created
FROM eos_meetings em
JOIN tenants t ON t.id = em.tenant_id;

-- RETENTION COMMENTS
COMMENT ON TYPE public.meeting_status IS
  'Superseded by dd_meeting_status (Phase 5F, 19 May 2026). '
  'Retained for rollback safety. Do not drop without Carl/Dave sign-off '
  'after a documented stable period in production.';

COMMENT ON COLUMN public.eos_meetings.status IS
  'FK -> dd_meeting_status.value. Was enum public.meeting_status until Phase 5F migration (19 May 2026).';

-- POST-FLIGHT CHECKS
DO $$
DECLARE
  v_count   INTEGER;
  v_invalid INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.eos_meetings;
  RAISE NOTICE 'Post-flight: eos_meetings has % rows.', v_count;
  SELECT COUNT(*) INTO v_invalid
  FROM (
    SELECT DISTINCT status FROM public.eos_meetings
    EXCEPT
    SELECT value FROM public.dd_meeting_status
  ) t;
  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'FAILED: % distinct status values have no matching dd_meeting_status row', v_invalid;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'eos_meetings'
      AND column_name = 'status' AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'FAILED: eos_meetings.status is not text';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'eos_meetings' AND constraint_name = 'fk_eos_meetings_status'
  ) THEN
    RAISE EXCEPTION 'FAILED: fk_eos_meetings_status not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_views
    WHERE schemaname = 'public' AND definition ILIKE '%::meeting_status%'
  ) THEN
    RAISE EXCEPTION 'FAILED: ::meeting_status cast still present in a view';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'generate_series_instances'
      AND pg_get_functiondef(p.oid) ILIKE '%::public.meeting_status%'
  ) THEN
    RAISE EXCEPTION 'FAILED: generate_series_instances still contains ::public.meeting_status cast';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'meeting_status' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'FAILED: legacy meeting_status enum missing from public schema';
  END IF;
  RAISE NOTICE 'All post-flight checks passed.';
END $$;

-- ROLLBACK (commented — not auto-executed)
-- ALTER TABLE public.eos_meetings DROP CONSTRAINT fk_eos_meetings_status;
-- ALTER TABLE public.eos_meetings ALTER COLUMN status DROP DEFAULT;
-- ALTER TABLE public.eos_meetings ALTER COLUMN status TYPE public.meeting_status USING status::public.meeting_status;
-- ALTER TABLE public.eos_meetings ALTER COLUMN status SET DEFAULT 'scheduled'::public.meeting_status;
-- [Drop and restore 5 views with ::meeting_status casts]
-- [Drop and restore idx_quarterly_meeting_unique with ::meeting_status cast]
-- [Restore generate_series_instances with 'scheduled'::public.meeting_status]
-- DROP TABLE public.dd_meeting_status;