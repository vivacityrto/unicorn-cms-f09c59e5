-- ============================================================================
-- Phase 5E Migration 2 (retry): eos_meeting_type enum → dd_eos_meeting_type FK
-- Adds drop/recreate of 4 dependent views.
-- ============================================================================

DO $preflight$
DECLARE
  v_count        integer;
  v_known_values text[] := ARRAY['L10','Quarterly','Annual','Focus_Day','Custom','Same_Page'];
BEGIN
  SELECT count(*) INTO v_count FROM public.dd_eos_meeting_type;
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAIL: dd_eos_meeting_type has % rows, expected 6', v_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_known_values) AS k(v)
    WHERE NOT EXISTS (SELECT 1 FROM public.dd_eos_meeting_type d WHERE d.value = k.v)
  ) THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAIL: dd_eos_meeting_type missing one or more expected values';
  END IF;

  SELECT count(*) INTO v_count FROM public.eos_agenda_templates;
  IF v_count <> 2029 THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAIL: eos_agenda_templates row count = %, expected 2029', v_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.eos_agenda_templates WHERE meeting_type IS NULL) THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAIL: NULL meeting_type in eos_agenda_templates';
  END IF;
  IF EXISTS (SELECT 1 FROM public.eos_agenda_templates WHERE meeting_type::text <> ALL (v_known_values)) THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAIL: unknown meeting_type value in eos_agenda_templates';
  END IF;

  SELECT count(*) INTO v_count FROM public.eos_meeting_series;
  IF v_count <> 7 THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAIL: eos_meeting_series row count = %, expected 7', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.eos_meetings;
  IF v_count <> 17 THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAIL: eos_meetings row count = %, expected 17', v_count;
  END IF;
END
$preflight$;

-- Drop dependent views (recreated below)
DROP VIEW IF EXISTS public.eos_past_meetings;
DROP VIEW IF EXISTS public.eos_upcoming_meetings;
DROP VIEW IF EXISTS public.eos_meeting_attendance_summary;
DROP VIEW IF EXISTS public.v_client_decisions_approvals;

DROP INDEX public.idx_quarterly_meeting_unique;

DROP FUNCTION IF EXISTS public.create_meeting_series(
  bigint, eos_meeting_type, text, text, date, time without time zone,
  integer, text, uuid, uuid, integer
);

ALTER TABLE public.eos_agenda_templates ALTER COLUMN meeting_type TYPE text USING meeting_type::text;
ALTER TABLE public.eos_meeting_series   ALTER COLUMN meeting_type TYPE text USING meeting_type::text;
ALTER TABLE public.eos_meetings         ALTER COLUMN meeting_type TYPE text USING meeting_type::text;

ALTER TABLE public.eos_agenda_templates
  ADD CONSTRAINT fk_eos_agenda_templates_meeting_type
    FOREIGN KEY (meeting_type) REFERENCES public.dd_eos_meeting_type(value)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.eos_meeting_series
  ADD CONSTRAINT fk_eos_meeting_series_meeting_type
    FOREIGN KEY (meeting_type) REFERENCES public.dd_eos_meeting_type(value)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.eos_meetings
  ADD CONSTRAINT fk_eos_meetings_meeting_type
    FOREIGN KEY (meeting_type) REFERENCES public.dd_eos_meeting_type(value)
    ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE UNIQUE INDEX idx_quarterly_meeting_unique ON public.eos_meetings
  USING btree (tenant_id, fiscal_year, fiscal_quarter)
  WHERE ((meeting_type = 'Quarterly') AND (status <> 'cancelled'::meeting_status));

-- Recreate views (original definitions)
CREATE VIEW public.eos_past_meetings AS
SELECT m.id, m.tenant_id, m.client_id, m.meeting_type, m.title, m.scheduled_date,
       m.duration_minutes, m.location, m.notes, m.scorecard_data, m.rock_reviews,
       m.headlines, m.issues_discussed, m.is_complete, m.completed_at, m.created_at,
       m.updated_at, m.created_by, m.recurrence_rule, m.recurrence_end_date,
       m.parent_meeting_id, m.is_multi_client, m.template_id, m.template_version_id,
       m.current_minutes_version_id, m.minutes_status, m.status, m.series_id,
       m.agenda_snapshot, m.actual_duration_minutes, m.started_at, m.closed_at,
       s.recurrence_type, s.title AS series_title
FROM public.eos_meetings m
LEFT JOIN public.eos_meeting_series s ON m.series_id = s.id
WHERE (m.status = ANY (ARRAY['closed'::meeting_status, 'completed'::meeting_status, 'cancelled'::meeting_status]))
   OR (m.status = 'scheduled'::meeting_status AND m.scheduled_date < CURRENT_DATE)
ORDER BY m.scheduled_date DESC;

CREATE VIEW public.eos_upcoming_meetings AS
SELECT m.id, m.tenant_id, m.client_id, m.meeting_type, m.title, m.scheduled_date,
       m.duration_minutes, m.location, m.notes, m.scorecard_data, m.rock_reviews,
       m.headlines, m.issues_discussed, m.is_complete, m.completed_at, m.created_at,
       m.updated_at, m.created_by, m.recurrence_rule, m.recurrence_end_date,
       m.parent_meeting_id, m.is_multi_client, m.template_id, m.template_version_id,
       m.current_minutes_version_id, m.minutes_status, m.status, m.series_id,
       m.agenda_snapshot, m.actual_duration_minutes, m.started_at, m.closed_at,
       s.recurrence_type, s.is_active AS series_is_active
FROM public.eos_meetings m
LEFT JOIN public.eos_meeting_series s ON m.series_id = s.id
WHERE (m.status = ANY (ARRAY['scheduled'::meeting_status, 'in_progress'::meeting_status]))
  AND m.scheduled_date >= CURRENT_DATE
ORDER BY m.scheduled_date;

CREATE VIEW public.eos_meeting_attendance_summary AS
SELECT m.id AS meeting_id, m.meeting_type, m.title, m.scheduled_date, m.status, m.quorum_met,
  count(a.id) FILTER (WHERE a.attendance_status = 'invited'::text OR (a.attendance_status = ANY (ARRAY['attended'::text, 'late'::text, 'left_early'::text, 'no_show'::text]))) AS invited_count,
  count(a.id) FILTER (WHERE a.attendance_status = ANY (ARRAY['attended'::text, 'late'::text])) AS present_count,
  count(a.id) FILTER (WHERE a.attendance_status = 'late'::text) AS late_count,
  count(a.id) FILTER (WHERE a.attendance_status = 'left_early'::text) AS left_early_count,
  count(a.id) FILTER (WHERE a.attendance_status = 'no_show'::text) AS no_show_count,
  CASE WHEN count(a.id) FILTER (WHERE a.attendance_status <> 'declined'::text) > 0
       THEN round(100.0 * count(a.id) FILTER (WHERE a.attendance_status = ANY (ARRAY['attended'::text, 'late'::text]))::numeric
                  / NULLIF(count(a.id) FILTER (WHERE a.attendance_status <> 'declined'::text), 0)::numeric, 1)
       ELSE 0::numeric END AS attendance_rate
FROM public.eos_meetings m
LEFT JOIN public.eos_meeting_attendees a ON a.meeting_id = m.id
GROUP BY m.id;

CREATE VIEW public.v_client_decisions_approvals AS
SELECT em.id AS meeting_id, em.tenant_id, t.name AS client_name, em.meeting_type,
       em.title AS meeting_title, em.scheduled_date, em.status AS meeting_status,
       em.is_complete, em.completed_at, em.quorum_met,
       (SELECT count(*) FROM public.eos_todos et WHERE et.meeting_id = em.id) AS todos_created,
       (SELECT count(*) FROM public.eos_issues ei WHERE ei.meeting_id = em.id AND ei.deleted_at IS NULL) AS issues_created
FROM public.eos_meetings em
JOIN public.tenants t ON t.id = em.tenant_id;

-- Recreate functions (remove ::eos_meeting_type casts; widen text parameters)
CREATE OR REPLACE FUNCTION public.create_meeting_series(
  p_tenant_id bigint,
  p_meeting_type text,
  p_title text,
  p_recurrence_type text,
  p_start_date date,
  p_start_time time without time zone DEFAULT '09:00:00'::time without time zone,
  p_duration_minutes integer DEFAULT 90,
  p_location text DEFAULT NULL::text,
  p_template_id uuid DEFAULT NULL::uuid,
  p_template_version_id uuid DEFAULT NULL::uuid,
  p_weeks_ahead integer DEFAULT 6
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_series_id UUID;
  v_user_id UUID := auth.uid();
BEGIN
  INSERT INTO eos_meeting_series (
    tenant_id, meeting_type, title, recurrence_type, start_date, start_time,
    duration_minutes, location, agenda_template_id, agenda_template_version_id, created_by
  ) VALUES (
    p_tenant_id, p_meeting_type, p_title, p_recurrence_type, p_start_date, p_start_time,
    p_duration_minutes, p_location, p_template_id, p_template_version_id, v_user_id
  )
  RETURNING id INTO v_series_id;

  PERFORM generate_series_instances(v_series_id, p_weeks_ahead);

  INSERT INTO audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
  VALUES (
    p_tenant_id, 'meeting_series', v_series_id::TEXT, 'meeting_series_created', v_user_id,
    jsonb_build_object('meeting_type', p_meeting_type, 'recurrence_type', p_recurrence_type, 'title', p_title)
  );

  RETURN v_series_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_meeting_basic(
  p_tenant_id bigint,
  p_meeting_type text,
  p_title text,
  p_scheduled_date timestamp with time zone,
  p_facilitator_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meeting_id UUID;
BEGIN
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

CREATE OR REPLACE FUNCTION public.create_meeting_basic(
  p_tenant_id integer,
  p_title text,
  p_meeting_type text,
  p_scheduled_date timestamp with time zone,
  p_duration_minutes integer,
  p_facilitator_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meeting_id uuid;
BEGIN
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

CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_template_id uuid,
  p_scheduled_date timestamp with time zone,
  p_scheduled_end_time timestamp with time zone,
  p_facilitator_id uuid,
  p_scribe_id uuid,
  p_location text DEFAULT NULL::text,
  p_participant_ids uuid[] DEFAULT NULL::uuid[],
  p_title text DEFAULT NULL::text,
  p_series_id uuid DEFAULT NULL::uuid,
  p_tenant_id bigint DEFAULT NULL::bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  SELECT template_name, template_type::text, duration_minutes, segments, tenant_id,
         COALESCE(meeting_scope, 'tenant')
  INTO v_template_name, v_template_type, v_duration_minutes, v_agenda_json, v_tenant_id, v_meeting_scope
  FROM public.eos_agenda_templates
  WHERE id = p_template_id;

  IF v_template_name IS NULL THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;

  IF p_tenant_id IS NOT NULL THEN
    v_tenant_id := p_tenant_id;
  END IF;

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
  )
  RETURNING id INTO v_meeting_id;

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
    WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
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

  PERFORM seed_meeting_attendees_from_roles(v_meeting_id);

  RETURN v_meeting_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.seed_system_agenda_templates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant RECORD;
BEGIN
  FOR v_tenant IN SELECT DISTINCT id FROM public.tenants
  LOOP
    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, description, segments, is_default, is_system, is_archived
    )
    SELECT v_tenant.id, 'L10', 'Level 10 Meeting',
      'EOS canonical 90-minute weekly execution meeting. Follows exact EOS Level 10 agenda structure.',
      '[{"name":"Segue","duration":5,"description":"Personal and business check-in. Share good news."},
        {"name":"Scorecard","duration":5,"description":"Review weekly metrics. Flag any out-of-range numbers."},
        {"name":"Rock Review","duration":5,"description":"Quick On-Track/Off-Track status for each Rock. No discussion."},
        {"name":"Headlines","duration":5,"description":"Customer/Employee headlines. Good news and FYIs."},
        {"name":"To-Do List","duration":5,"description":"Review last week To-Dos. Mark complete or carry forward."},
        {"name":"IDS","duration":60,"description":"Identify, Discuss, Solve. Work through prioritised issues one at a time."},
        {"name":"Conclude","duration":5,"description":"Recap To-Dos and cascading messages. Rate meeting 1-10."}]'::jsonb,
      true, true, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.eos_agenda_templates
      WHERE tenant_id = v_tenant.id AND meeting_type = 'L10' AND is_system = true AND is_archived = false
    );

    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, description, segments, is_default, is_system, is_archived
    )
    SELECT v_tenant.id, 'Quarterly', 'Quarterly Meeting',
      'EOS canonical Quarterly planning and review meeting.',
      '[{"name":"Segue","duration":15,"description":"Check-in. Share personal and professional updates."},
        {"name":"Review Previous Flight Plan","duration":60,"description":"Review previous quarter Rocks. Score as complete or incomplete."},
        {"name":"Review Mission Control","duration":45,"description":"Review V/TO. Confirm vision, values, and targets."},
        {"name":"Establish Next Quarter Rocks","duration":90,"description":"Set 3-7 company Rocks for the upcoming quarter."},
        {"name":"Tackle Key Issues","duration":120,"description":"IDS on quarterly-level issues. Strategic problem solving."},
        {"name":"Next Steps","duration":45,"description":"Cascade messages, assign action items, confirm accountability."},
        {"name":"Conclude","duration":30,"description":"Summarise decisions. Rate the meeting. Schedule next quarterly."}]'::jsonb,
      true, true, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.eos_agenda_templates
      WHERE tenant_id = v_tenant.id AND meeting_type = 'Quarterly' AND is_system = true AND is_archived = false
    );

    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, description, segments, is_default, is_system, is_archived
    )
    SELECT v_tenant.id, 'Annual', 'Annual Strategic Planning',
      'EOS canonical Annual Planning meeting. Two-day strategic planning session.',
      '[{"name":"Day 1: Segue","duration":30,"description":"Check-in. Share personal and professional updates."},
        {"name":"Day 1: Review Previous Mission Control","duration":60,"description":"Review last year V/TO. Score annual goals."},
        {"name":"Day 1: Team Health","duration":90,"description":"Right People Right Seats. Address team dynamics."},
        {"name":"Day 1: SWOT/Issues List","duration":120,"description":"Strategic SWOT analysis. Build annual issues list."},
        {"name":"Day 1: Review Mission Control","duration":60,"description":"Update V/TO. Confirm 10-year target, 3-year picture."},
        {"name":"Day 2: Establish Next Quarter Rocks","duration":120,"description":"Set Q1 Rocks aligned with annual priorities."},
        {"name":"Day 2: Tackle Key Issues","duration":120,"description":"IDS on annual-level strategic issues."},
        {"name":"Day 2: Conclude","duration":30,"description":"Cascade messages. Rate meeting. Confirm next steps."}]'::jsonb,
      true, true, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.eos_agenda_templates
      WHERE tenant_id = v_tenant.id AND meeting_type = 'Annual' AND is_system = true AND is_archived = false
    );

    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, description, segments, is_default, is_system, is_archived
    )
    SELECT v_tenant.id, 'Same_Page', 'Same Page Meeting',
      'EOS Same Page Meeting for Visionary and Integrator alignment. 120-minute structured discussion.',
      '[{"name":"Check-In","duration":10,"description":"Personal and professional updates between Visionary and Integrator."},
        {"name":"Review V/TO","duration":20,"description":"Confirm alignment on vision, values, and targets."},
        {"name":"Clarify Roles and Ownership","duration":20,"description":"Review Visionary vs Integrator responsibilities. Address any friction."},
        {"name":"Discuss Key Issues","duration":40,"description":"Open discussion on strategic concerns, people issues, and priorities."},
        {"name":"Align on Priorities","duration":20,"description":"Agree on top priorities for the upcoming period."},
        {"name":"Decisions and Next Steps","duration":10,"description":"Capture decisions, assign actions, confirm follow-up."}]'::jsonb,
      true, true, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.eos_agenda_templates
      WHERE tenant_id = v_tenant.id AND meeting_type = 'Same_Page' AND is_system = true AND is_archived = false
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_meeting_with_validation(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_validation RECORD;
  v_first_segment_id UUID;
  v_meeting_type TEXT;
BEGIN
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

CREATE OR REPLACE FUNCTION public.validate_meeting_agenda(p_meeting_id uuid)
RETURNS TABLE(is_valid boolean, missing_segments text[], error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meeting_type TEXT;
  v_required_segments TEXT[];
  v_actual_segments TEXT[];
  v_missing TEXT[];
BEGIN
  SELECT meeting_type::TEXT INTO v_meeting_type
  FROM public.eos_meetings
  WHERE id = p_meeting_id;

  IF v_meeting_type IS NULL THEN
    RETURN QUERY SELECT false, ARRAY[]::TEXT[], 'Meeting not found';
    RETURN;
  END IF;

  CASE v_meeting_type
    WHEN 'L10' THEN
      v_required_segments := ARRAY['Segue', 'Scorecard', 'Rock Review', 'Headlines', 'To-Do List', 'IDS', 'Conclude'];
    WHEN 'Quarterly' THEN
      v_required_segments := ARRAY['Segue', 'Review Previous Flight Plan', 'Review Mission Control', 'Establish Next Quarter Rocks', 'Tackle Key Issues', 'Next Steps', 'Conclude'];
    WHEN 'Annual' THEN
      v_required_segments := ARRAY['Day 1: Segue', 'Day 1: Review Previous Mission Control', 'Day 1: Team Health', 'Day 1: SWOT/Issues List', 'Day 1: Review Mission Control', 'Day 2: Establish Next Quarter Rocks', 'Day 2: Tackle Key Issues', 'Day 2: Conclude'];
    WHEN 'Same_Page' THEN
      v_required_segments := ARRAY['Check-In', 'Review V/TO', 'Clarify Roles and Ownership', 'Discuss Key Issues', 'Align on Priorities', 'Decisions and Next Steps'];
    ELSE
      RETURN QUERY SELECT true, ARRAY[]::TEXT[], NULL;
      RETURN;
  END CASE;

  SELECT ARRAY_AGG(segment_name ORDER BY sequence_order)
  INTO v_actual_segments
  FROM public.eos_meeting_segments
  WHERE meeting_id = p_meeting_id;

  IF v_actual_segments IS NULL THEN
    RETURN QUERY SELECT false, v_required_segments, 'No agenda segments found. Meeting must be created from a system template.';
    RETURN;
  END IF;

  SELECT ARRAY_AGG(req)
  INTO v_missing
  FROM UNNEST(v_required_segments) AS req
  WHERE NOT EXISTS (
    SELECT 1 FROM UNNEST(v_actual_segments) AS actual
    WHERE actual ILIKE '%' || req || '%' OR req ILIKE '%' || actual || '%'
  );

  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RETURN QUERY SELECT false, v_missing, format('Missing required EOS segments: %s', array_to_string(v_missing, ', '));
    RETURN;
  END IF;

  RETURN QUERY SELECT true, ARRAY[]::TEXT[], NULL;
END;
$function$;

COMMENT ON TYPE public.eos_meeting_type IS
  'Retained for rollback safety after Phase 5E migration (superseded by dd_eos_meeting_type). Do NOT drop until Phase 5Z cleanup. Permanent DROP requires Carl/Dave sign-off.';

DO $postflight$
DECLARE
  v_count    integer;
  v_indexdef text;
  v_argtypes text;
  v_bad      integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.eos_agenda_templates;
  IF v_count <> 2029 THEN
    RAISE EXCEPTION 'POST-FLIGHT FAIL: eos_agenda_templates row count = %, expected 2029', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.eos_meeting_series;
  IF v_count <> 7 THEN
    RAISE EXCEPTION 'POST-FLIGHT FAIL: eos_meeting_series row count = %, expected 7', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.eos_meetings;
  IF v_count <> 17 THEN
    RAISE EXCEPTION 'POST-FLIGHT FAIL: eos_meetings row count = %, expected 17', v_count;
  END IF;

  SELECT
    (SELECT count(*) FROM public.eos_agenda_templates WHERE meeting_type NOT IN (SELECT value FROM public.dd_eos_meeting_type))
    + (SELECT count(*) FROM public.eos_meeting_series WHERE meeting_type NOT IN (SELECT value FROM public.dd_eos_meeting_type))
    + (SELECT count(*) FROM public.eos_meetings        WHERE meeting_type NOT IN (SELECT value FROM public.dd_eos_meeting_type))
  INTO v_bad;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'POST-FLIGHT FAIL: % rows have meeting_type outside dd_eos_meeting_type.value', v_bad;
  END IF;

  IF (
    SELECT count(*) FROM pg_constraint
    WHERE conname IN (
      'fk_eos_agenda_templates_meeting_type',
      'fk_eos_meeting_series_meeting_type',
      'fk_eos_meetings_meeting_type'
    ) AND contype = 'f' AND convalidated = true
  ) <> 3 THEN
    RAISE EXCEPTION 'POST-FLIGHT FAIL: expected 3 valid FK constraints on meeting_type';
  END IF;

  SELECT indexdef INTO v_indexdef
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname = 'idx_quarterly_meeting_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'POST-FLIGHT FAIL: idx_quarterly_meeting_unique does not exist';
  END IF;
  IF v_indexdef LIKE '%::eos_meeting_type%' THEN
    RAISE EXCEPTION 'POST-FLIGHT FAIL: idx_quarterly_meeting_unique still contains ::eos_meeting_type cast';
  END IF;

  SELECT pg_get_function_identity_arguments(p.oid) INTO v_argtypes
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_meeting_series'
  ORDER BY p.oid LIMIT 1;
  IF v_argtypes LIKE '%eos_meeting_type%' THEN
    RAISE EXCEPTION 'POST-FLIGHT FAIL: create_meeting_series still has eos_meeting_type in signature: %', v_argtypes;
  END IF;
  IF v_argtypes NOT LIKE '%p_meeting_type text%' THEN
    RAISE EXCEPTION 'POST-FLIGHT FAIL: create_meeting_series signature missing p_meeting_type text: %', v_argtypes;
  END IF;

  SELECT count(*) INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosrc LIKE '%::eos_meeting_type%';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'POST-FLIGHT FAIL: % public function bodies still contain ::eos_meeting_type cast', v_bad;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'eos_meeting_type'
  ) THEN
    RAISE EXCEPTION 'POST-FLIGHT FAIL: legacy public.eos_meeting_type enum was dropped';
  END IF;
END
$postflight$;