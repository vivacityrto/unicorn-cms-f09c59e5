-- ============================================================
-- Rollback for 20260723064007_eos_overhaul_m5_structural_cleanup.sql
-- Recreates every dropped object verbatim from its live definition
-- captured before this migration ran. Run BEFORE M4's rollback if both
-- need reverting (apply order was M4 then M5; rollback order is M5
-- down, then M4 down).
--
-- Step 2.5 also restores v_workspace_audit_log's original UNION ALL
-- branch over eos_template_audit_log, which the up-migration dropped
-- (via CREATE OR REPLACE VIEW) to unblock the DROP TABLE. Must run
-- after step 2 recreates the table, which is why it's placed there.
-- ============================================================

BEGIN;

-- 5. Restore dd_ rows
INSERT INTO public.dd_eos_meeting_type (value, label, sort_order, is_active)
SELECT 'Focus_Day', 'Focus Day', 40, true
WHERE NOT EXISTS (SELECT 1 FROM public.dd_eos_meeting_type WHERE value = 'Focus_Day');
INSERT INTO public.dd_eos_meeting_type (value, label, sort_order, is_active)
SELECT 'Custom', 'Custom', 50, true
WHERE NOT EXISTS (SELECT 1 FROM public.dd_eos_meeting_type WHERE value = 'Custom');
-- NOTE: sort_order values above are best-effort placeholders (original
-- live sort_order was not captured pre-drop) - verify/adjust ordering
-- against the surviving 4 rows after restore if this rollback ever runs.

-- 4. Recreate dropped RPC overloads verbatim
CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_template_id uuid, p_scheduled_date timestamp with time zone, p_scheduled_end_time timestamp with time zone,
  p_facilitator_id uuid, p_scribe_id uuid, p_location text DEFAULT NULL::text,
  p_participant_ids uuid[] DEFAULT NULL::uuid[], p_title text DEFAULT NULL::text,
  p_series_id uuid DEFAULT NULL::uuid, p_tenant_id bigint DEFAULT NULL::bigint
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

CREATE OR REPLACE FUNCTION public.create_meeting_basic(
  p_tenant_id bigint, p_meeting_type text, p_title text,
  p_scheduled_date timestamp with time zone, p_facilitator_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.close_meeting_with_validation(p_meeting_id uuid)
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
BEGIN
  v_current_user_id := auth.uid();
  SELECT m.*, t.id as tid INTO v_meeting FROM eos_meetings m JOIN tenants t ON t.id = m.tenant_id WHERE m.id = p_meeting_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Meeting not found'); END IF;
  v_tenant_id := v_meeting.tid;
  IF v_meeting.status != 'in_progress' THEN
    RETURN json_build_object('success', false, 'error', 'Meeting must be in progress to close');
  END IF;

  SELECT COUNT(*) INTO v_present_count FROM eos_meeting_attendees
    WHERE meeting_id = p_meeting_id AND attendance_status IN ('attended', 'late', 'left_early');
  SELECT COUNT(*) INTO v_total_attendees FROM eos_meeting_attendees WHERE meeting_id = p_meeting_id;

  IF v_total_attendees > 0 THEN
    IF v_present_count < CEIL(v_total_attendees * 0.5) THEN
      v_validation_errors := array_append(v_validation_errors,
        format('Quorum not met: %s present, need %s', v_present_count, CEIL(v_total_attendees * 0.5)::INTEGER));
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_ratings_count FROM eos_meeting_ratings WHERE meeting_id = p_meeting_id;
  v_required_ratings := GREATEST(1, FLOOR(v_present_count * 0.5));
  IF v_ratings_count < v_required_ratings THEN
    v_validation_errors := array_append(v_validation_errors,
      format('Not enough ratings: %s submitted, need %s', v_ratings_count, v_required_ratings));
  END IF;

  IF array_length(v_validation_errors, 1) > 0 THEN
    INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
    VALUES (v_tenant_id, p_meeting_id, 'meeting', 'meeting_validation_failed', p_meeting_id, v_current_user_id,
      json_build_object('errors', v_validation_errors));
    RETURN json_build_object('success', false, 'error', 'Validation failed', 'validation_errors', v_validation_errors);
  END IF;

  UPDATE eos_meetings SET status = 'closed', completed_at = NOW(), updated_at = NOW() WHERE id = p_meeting_id;

  BEGIN
    PERFORM generate_meeting_summary(p_meeting_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
  VALUES (v_tenant_id, p_meeting_id, 'meeting', 'meeting_closed', p_meeting_id, v_current_user_id,
    json_build_object('present_count', v_present_count, 'ratings_count', v_ratings_count));

  RETURN json_build_object('success', true, 'message', 'Meeting closed successfully');
END;
$function$;

-- 3. Recreate auto-seed trigger + functions
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
        {"name":"Customer/Employee Headlines","duration":5,"description":"Customer/Employee headlines. Good news and FYIs."},
        {"name":"IDS (Identify, Discuss, Solve)","duration":60,"description":"Identify, Discuss, Solve. Work through prioritised issues one at a time."},
        {"name":"To-Do List","duration":5,"description":"Review last week To-Dos. Mark complete or carry forward."},
        {"name":"Conclude / One Phrase Close","duration":5,"description":"Recap To-Dos and cascading messages. Rate meeting 1-10."}]'::jsonb,
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

CREATE OR REPLACE FUNCTION public.seed_system_agenda_templates(p_tenant_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_level10_segments JSONB;
  v_quarterly_segments JSONB;
  v_annual_segments JSONB;
  v_template_id UUID;
  v_version_id UUID;
BEGIN
  IF EXISTS (
    SELECT 1 FROM eos_agenda_templates
    WHERE tenant_id = p_tenant_id AND is_system = true
  ) THEN
    RETURN;
  END IF;

  v_level10_segments := '[
    {"name": "Segue", "duration": 5},
    {"name": "Scorecard", "duration": 5},
    {"name": "Rock Review", "duration": 5},
    {"name": "Customer/Employee Headlines", "duration": 5},
    {"name": "IDS (Identify, Discuss, Solve)", "duration": 60},
    {"name": "To-Do List", "duration": 5},
    {"name": "Conclude / One Phrase Close", "duration": 5}
  ]'::JSONB;

  v_quarterly_segments := '[
    {"name": "Segue", "duration": 15},
    {"name": "Review Previous Flight Plan", "duration": 45},
    {"name": "Review Mission Control", "duration": 60},
    {"name": "Establish Next Quarter''s Rocks", "duration": 90},
    {"name": "Tackle Key Issues", "duration": 120},
    {"name": "Next Steps", "duration": 30},
    {"name": "Conclude", "duration": 15}
  ]'::JSONB;

  v_annual_segments := '[
    {"name": "Day 1: Segue", "duration": 15},
    {"name": "Day 1: Review Previous Mission Control", "duration": 60},
    {"name": "Day 1: Team Health", "duration": 45},
    {"name": "Day 1: SWOT/Issues List", "duration": 90},
    {"name": "Day 1: Review Mission Control", "duration": 120},
    {"name": "Day 2: Establish Next Quarter''s Rocks", "duration": 120},
    {"name": "Day 2: Tackle Key Issues", "duration": 180}
  ]'::JSONB;

  v_template_id := gen_random_uuid();
  v_version_id := gen_random_uuid();
  INSERT INTO eos_agenda_templates (id, tenant_id, template_name, meeting_type, segments, is_default, is_system, is_archived, description)
  VALUES (v_template_id, p_tenant_id, 'Standard Level 10', 'L10', v_level10_segments, true, true, false, 'EOS canonical 90-minute weekly execution meeting agenda');
  INSERT INTO eos_agenda_template_versions (id, template_id, version_number, segments_snapshot, change_summary, is_published, created_by)
  VALUES (v_version_id, v_template_id, 1, v_level10_segments, 'Initial system template', true, NULL);
  UPDATE eos_agenda_templates SET current_version_id = v_version_id WHERE id = v_template_id;

  v_template_id := gen_random_uuid();
  v_version_id := gen_random_uuid();
  INSERT INTO eos_agenda_templates (id, tenant_id, template_name, meeting_type, segments, is_default, is_system, is_archived, description)
  VALUES (v_template_id, p_tenant_id, 'Standard Quarterly Meeting', 'Quarterly', v_quarterly_segments, true, true, false, 'Full-day strategic session to review progress and set next quarter Flight Plan');
  INSERT INTO eos_agenda_template_versions (id, template_id, version_number, segments_snapshot, change_summary, is_published, created_by)
  VALUES (v_version_id, v_template_id, 1, v_quarterly_segments, 'Initial system template', true, NULL);
  UPDATE eos_agenda_templates SET current_version_id = v_version_id WHERE id = v_template_id;

  v_template_id := gen_random_uuid();
  v_version_id := gen_random_uuid();
  INSERT INTO eos_agenda_templates (id, tenant_id, template_name, meeting_type, segments, is_default, is_system, is_archived, description)
  VALUES (v_template_id, p_tenant_id, 'Annual Strategic Planning', 'Annual', v_annual_segments, true, true, false, 'Two-day strategic planning covering Mission Control, long-term planning, and annual priorities');
  INSERT INTO eos_agenda_template_versions (id, template_id, version_number, segments_snapshot, change_summary, is_published, created_by)
  VALUES (v_version_id, v_template_id, 1, v_annual_segments, 'Initial system template', true, NULL);
  UPDATE eos_agenda_templates SET current_version_id = v_version_id WHERE id = v_template_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_seed_agenda_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.seed_system_agenda_templates(NEW.id);
  RETURN NEW;
END;
$function$;

CREATE TRIGGER seed_agenda_templates_on_tenant_create
AFTER INSERT ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.auto_seed_agenda_templates();

-- 2. Recreate the dead versioning subsystem tables + functions
CREATE TABLE public.eos_agenda_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.eos_agenda_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  segments_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  change_summary text,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.eos_template_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  user_id uuid,
  template_id uuid,
  version_id uuid REFERENCES public.eos_agenda_template_versions(id) ON DELETE SET NULL,
  tenant_id bigint NOT NULL,
  change_summary text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.create_template_version(p_template_id uuid, p_segments jsonb, p_change_summary text, p_publish boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_template RECORD;
  v_new_version_number INT;
  v_version_id UUID;
  v_user_id UUID;
  v_tenant_id BIGINT;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  v_tenant_id := v_template.tenant_id;

  IF v_template.is_system THEN
    RAISE EXCEPTION 'System templates cannot be edited. Duplicate the template first.';
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_new_version_number
  FROM public.eos_agenda_template_versions
  WHERE template_id = p_template_id;

  INSERT INTO public.eos_agenda_template_versions (
    template_id, version_number, segments_snapshot, change_summary, is_published, created_by
  ) VALUES (
    p_template_id, v_new_version_number, p_segments, p_change_summary, p_publish, v_user_id
  ) RETURNING id INTO v_version_id;

  IF p_publish THEN
    UPDATE public.eos_agenda_templates
    SET segments = p_segments, current_version_id = v_version_id, updated_at = NOW()
    WHERE id = p_template_id;
  END IF;

  INSERT INTO public.eos_template_audit_log (
    action, user_id, template_id, version_id, tenant_id, change_summary, details
  ) VALUES (
    'template_version_created', v_user_id, p_template_id, v_version_id, v_tenant_id, p_change_summary,
    jsonb_build_object('version_number', v_new_version_number, 'is_published', p_publish, 'segments_count', jsonb_array_length(p_segments))
  );

  RETURN v_version_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_template_version(p_version_id uuid, p_restore_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_version RECORD;
  v_template RECORD;
  v_new_version_id UUID;
  v_new_version_number INT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_version
  FROM public.eos_agenda_template_versions
  WHERE id = p_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version not found';
  END IF;

  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = v_version.template_id;

  IF v_template.is_system THEN
    RAISE EXCEPTION 'Cannot restore versions for system templates';
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_new_version_number
  FROM public.eos_agenda_template_versions
  WHERE template_id = v_version.template_id;

  INSERT INTO public.eos_agenda_template_versions (
    template_id, version_number, segments_snapshot, change_summary, is_published, created_by
  ) VALUES (
    v_version.template_id, v_new_version_number, v_version.segments_snapshot,
    p_restore_reason || ' (restored from v' || v_version.version_number || ')', TRUE, v_user_id
  ) RETURNING id INTO v_new_version_id;

  UPDATE public.eos_agenda_templates
  SET segments = v_version.segments_snapshot, current_version_id = v_new_version_id, updated_at = NOW()
  WHERE id = v_version.template_id;

  INSERT INTO public.eos_template_audit_log (
    action, user_id, template_id, version_id, tenant_id, change_summary, details
  ) VALUES (
    'template_version_restored', v_user_id, v_version.template_id, v_new_version_id, v_template.tenant_id, p_restore_reason,
    jsonb_build_object('restored_from_version', v_version.version_number, 'new_version_number', v_new_version_number)
  );

  RETURN v_new_version_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.init_template_versions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_template RECORD;
  v_version_id UUID;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  FOR v_template IN
    SELECT * FROM public.eos_agenda_templates
    WHERE current_version_id IS NULL
  LOOP
    INSERT INTO public.eos_agenda_template_versions (
      template_id, version_number, segments_snapshot, change_summary,
      is_published, created_by, created_at
    ) VALUES (
      v_template.id, 1, v_template.segments, 'Initial version',
      TRUE, v_template.created_by, v_template.created_at
    ) RETURNING id INTO v_version_id;

    UPDATE public.eos_agenda_templates
    SET current_version_id = v_version_id
    WHERE id = v_template.id;
  END LOOP;
END;
$function$;

-- 2.5. Restore v_workspace_audit_log's original definition, including the
--      eos_template_audit_log UNION ALL branch removed by the up-migration
--      (table now exists again from step 2 above, so this is safe to run here)
CREATE OR REPLACE VIEW public.v_workspace_audit_log AS
 SELECT audit_eos_events.id,
    audit_eos_events.tenant_id,
    audit_eos_events.user_id AS actor_id,
    audit_eos_events.action,
    'eos_event'::text AS domain,
    audit_eos_events.entity AS entity_type,
    audit_eos_events.entity_id::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    audit_eos_events.details AS metadata,
    audit_eos_events.created_at
   FROM audit_eos_events
UNION ALL
 SELECT client_audit_log.id,
    client_audit_log.tenant_id,
    client_audit_log.actor_user_id AS actor_id,
    client_audit_log.action,
    'client'::text AS domain,
    client_audit_log.entity_type,
    client_audit_log.entity_id,
    client_audit_log.before_data AS old_val,
    client_audit_log.after_data AS new_val,
    client_audit_log.details AS metadata,
    client_audit_log.created_at
   FROM client_audit_log
UNION ALL
 SELECT time_entry_audit_log.id,
    time_entry_audit_log.tenant_id::bigint AS tenant_id,
    time_entry_audit_log.actor_user_id AS actor_id,
    time_entry_audit_log.action,
    'time_entry'::text AS domain,
    'time_entry'::text AS entity_type,
    time_entry_audit_log.time_entry_id::text AS entity_id,
    time_entry_audit_log.old_row AS old_val,
    time_entry_audit_log.new_row AS new_val,
    NULL::jsonb AS metadata,
    time_entry_audit_log.created_at
   FROM time_entry_audit_log
UNION ALL
 SELECT audit_client_impersonation.id,
    audit_client_impersonation.tenant_id::bigint AS tenant_id,
    audit_client_impersonation.actor_user_id AS actor_id,
    'impersonation_started'::text AS action,
    'impersonation'::text AS domain,
    'tenant'::text AS entity_type,
    audit_client_impersonation.tenant_id::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    jsonb_build_object('reason', audit_client_impersonation.reason, 'started_at', audit_client_impersonation.started_at, 'ended_at', audit_client_impersonation.ended_at) AS metadata,
    audit_client_impersonation.started_at AS created_at
   FROM audit_client_impersonation
UNION ALL
 SELECT tga_import_audit.id,
    tga_import_audit.tenant_id,
    tga_import_audit.triggered_by AS actor_id,
    tga_import_audit.action,
    'tga_import'::text AS domain,
    'tga_import'::text AS entity_type,
    COALESCE(tga_import_audit.run_id::text, tga_import_audit.rto_code) AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(tga_import_audit.metadata, '{}'::jsonb) || jsonb_build_object('rto_code', tga_import_audit.rto_code, 'stage', tga_import_audit.stage, 'status', tga_import_audit.status, 'rows_affected', tga_import_audit.rows_affected, 'error_message', tga_import_audit.error_message) AS metadata,
    tga_import_audit.created_at
   FROM tga_import_audit
UNION ALL
 SELECT sharepoint_access_log.id,
    sharepoint_access_log.tenant_id,
    sharepoint_access_log.user_id AS actor_id,
    sharepoint_access_log.action,
    'sharepoint'::text AS domain,
    'sharepoint_item'::text AS entity_type,
    sharepoint_access_log.item_id AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    jsonb_build_object('drive_id', sharepoint_access_log.drive_id, 'file_name', sharepoint_access_log.file_name) AS metadata,
    sharepoint_access_log.created_at
   FROM sharepoint_access_log
UNION ALL
 SELECT document_activity_log.id,
    document_activity_log.tenant_id,
    document_activity_log.actor_user_id AS actor_id,
    document_activity_log.activity_type AS action,
    'document'::text AS domain,
    'document'::text AS entity_type,
    document_activity_log.document_id::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(document_activity_log.metadata, '{}'::jsonb) || jsonb_build_object('client_id', document_activity_log.client_id, 'package_id', document_activity_log.package_id, 'stage_id', document_activity_log.stage_id, 'actor_role', document_activity_log.actor_role, 'file_name', document_activity_log.file_name) AS metadata,
    document_activity_log.occurred_at AS created_at
   FROM document_activity_log
UNION ALL
 SELECT portal_document_audit.id,
    portal_document_audit.tenant_id,
    portal_document_audit.actor_user_id AS actor_id,
    portal_document_audit.action,
    'portal_document'::text AS domain,
    portal_document_audit.document_type AS entity_type,
    portal_document_audit.document_id::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(portal_document_audit.metadata, '{}'::jsonb) || jsonb_build_object('actor_role', portal_document_audit.actor_role, 'reason', portal_document_audit.reason) AS metadata,
    portal_document_audit.occurred_at AS created_at
   FROM portal_document_audit
UNION ALL
 SELECT meeting_sync_audit.id,
    meeting_sync_audit.tenant_id,
    meeting_sync_audit.user_id AS actor_id,
    meeting_sync_audit.action,
    'meeting_sync'::text AS domain,
    'meeting_sync'::text AS entity_type,
    NULL::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    jsonb_build_object('meetings_created', meeting_sync_audit.meetings_created, 'meetings_updated', meeting_sync_audit.meetings_updated, 'meetings_skipped', meeting_sync_audit.meetings_skipped, 'error_message', meeting_sync_audit.error_message) AS metadata,
    meeting_sync_audit.created_at
   FROM meeting_sync_audit
UNION ALL
 SELECT engagement_audit_log.id,
    engagement_audit_log.tenant_id,
    engagement_audit_log.actor_user_uuid AS actor_id,
    engagement_audit_log.event_type AS action,
    'engagement'::text AS domain,
    'engagement'::text AS entity_type,
    COALESCE(engagement_audit_log.package_instance_id::text, engagement_audit_log.client_id::text) AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(engagement_audit_log.validation_notes, '{}'::jsonb) || jsonb_build_object('tier', engagement_audit_log.tier, 'integrity_validation_passed', engagement_audit_log.integrity_validation_passed, 'client_id', engagement_audit_log.client_id, 'package_instance_id', engagement_audit_log.package_instance_id) AS metadata,
    engagement_audit_log.created_at
   FROM engagement_audit_log
UNION ALL
 SELECT ai_events.ai_event_id AS id,
    ai_events.tenant_id,
    ai_events.actor_user_id AS actor_id,
    ai_events.task_type AS action,
    'ai'::text AS domain,
    ai_events.feature AS entity_type,
    ai_events.request_id AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    jsonb_build_object('model_name', ai_events.model_name, 'status', ai_events.status, 'latency_ms', ai_events.latency_ms, 'confidence', ai_events.confidence, 'input_hash', ai_events.input_hash, 'context_hash', ai_events.context_hash) AS metadata,
    ai_events.created_at
   FROM ai_events
UNION ALL
 SELECT eos_minutes_audit_log.id,
    eos_minutes_audit_log.tenant_id,
    eos_minutes_audit_log.user_id AS actor_id,
    eos_minutes_audit_log.action,
    'eos_minutes'::text AS domain,
    'meeting_minutes'::text AS entity_type,
    COALESCE(eos_minutes_audit_log.minutes_version_id::text, eos_minutes_audit_log.meeting_id::text) AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(eos_minutes_audit_log.details, '{}'::jsonb) || jsonb_build_object('change_summary', eos_minutes_audit_log.change_summary, 'meeting_id', eos_minutes_audit_log.meeting_id) AS metadata,
    eos_minutes_audit_log.created_at
   FROM eos_minutes_audit_log
UNION ALL
 SELECT eos_template_audit_log.id,
    eos_template_audit_log.tenant_id,
    eos_template_audit_log.user_id AS actor_id,
    eos_template_audit_log.action,
    'eos_template'::text AS domain,
    'eos_template'::text AS entity_type,
    COALESCE(eos_template_audit_log.version_id::text, eos_template_audit_log.template_id::text) AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(eos_template_audit_log.details, '{}'::jsonb) || jsonb_build_object('change_summary', eos_template_audit_log.change_summary, 'template_id', eos_template_audit_log.template_id) AS metadata,
    eos_template_audit_log.created_at
   FROM eos_template_audit_log
UNION ALL
 SELECT consultant_assignment_audit_log.id,
    consultant_assignment_audit_log.tenant_id,
    consultant_assignment_audit_log.created_by AS actor_id,
    consultant_assignment_audit_log.action,
    'consultant_assignment'::text AS domain,
    'consultant_assignment'::text AS entity_type,
    consultant_assignment_audit_log.selected_consultant_user_id::text AS entity_id,
    NULL::jsonb AS old_val,
    consultant_assignment_audit_log.candidate_snapshot AS new_val,
    jsonb_build_object('previous_consultant_user_id', consultant_assignment_audit_log.previous_consultant_user_id, 'over_capacity', consultant_assignment_audit_log.over_capacity, 'reason', consultant_assignment_audit_log.reason, 'new_client_weekly_required', consultant_assignment_audit_log.new_client_weekly_required, 'onboarding_multiplier', consultant_assignment_audit_log.onboarding_multiplier, 'selected_projected_remaining', consultant_assignment_audit_log.selected_projected_remaining) AS metadata,
    consultant_assignment_audit_log.created_at
   FROM consultant_assignment_audit_log
UNION ALL
 SELECT assistant_audit_log.id,
    assistant_audit_log.client_tenant_id AS tenant_id,
    assistant_audit_log.viewer_user_id AS actor_id,
    assistant_audit_log.action,
    'assistant'::text AS domain,
    assistant_audit_log.report_type AS entity_type,
    assistant_audit_log.thread_id::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    jsonb_build_object('sources_used', assistant_audit_log.sources_used, 'redactions_applied', assistant_audit_log.redactions_applied, 'request_text', assistant_audit_log.request_text, 'response_summary', assistant_audit_log.response_summary) AS metadata,
    assistant_audit_log.created_at
   FROM assistant_audit_log
UNION ALL
 SELECT audit_restricted_actions.id,
    audit_restricted_actions.tenant_id,
    audit_restricted_actions.user_id AS actor_id,
    audit_restricted_actions.action_attempted AS action,
    'restricted_action'::text AS domain,
    NULL::text AS entity_type,
    NULL::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    jsonb_build_object('permission_required', audit_restricted_actions.permission_required, 'user_role', audit_restricted_actions.user_role, 'page_path', audit_restricted_actions.page_path) AS metadata,
    audit_restricted_actions.created_at
   FROM audit_restricted_actions
UNION ALL
 SELECT audit_user_events.id,
    audit_user_events.tenant_id,
    audit_user_events.actor_user_uuid AS actor_id,
    audit_user_events.action,
    'user'::text AS domain,
    'user'::text AS entity_type,
    audit_user_events.target_user_uuid::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(audit_user_events.details, '{}'::jsonb) || jsonb_build_object('reason', audit_user_events.reason) AS metadata,
    audit_user_events.created_at
   FROM audit_user_events
UNION ALL
 SELECT process_audit_log.id,
    process_audit_log.tenant_id,
    process_audit_log.actor_user_id AS actor_id,
    process_audit_log.action,
    'process'::text AS domain,
    'process'::text AS entity_type,
    process_audit_log.process_id::text AS entity_id,
    process_audit_log.before_data AS old_val,
    process_audit_log.after_data AS new_val,
    COALESCE(process_audit_log.details, '{}'::jsonb) || jsonb_build_object('reason', process_audit_log.reason) AS metadata,
    process_audit_log.occurred_at AS created_at
   FROM process_audit_log
UNION ALL
 SELECT consultant_capacity_audit_log.id,
    consultant_capacity_audit_log.tenant_id,
    consultant_capacity_audit_log.created_by AS actor_id,
    consultant_capacity_audit_log.assignment_method AS action,
    'consultant_capacity'::text AS domain,
    'consultant_capacity'::text AS entity_type,
    consultant_capacity_audit_log.selected_consultant_user_id::text AS entity_id,
    NULL::jsonb AS old_val,
    consultant_capacity_audit_log.candidate_snapshot AS new_val,
    jsonb_build_object('weekly_assignable_hours', consultant_capacity_audit_log.weekly_assignable_hours, 'consultant_current_load', consultant_capacity_audit_log.consultant_current_load, 'projected_remaining', consultant_capacity_audit_log.projected_remaining, 'new_client_weekly_required', consultant_capacity_audit_log.new_client_weekly_required, 'over_capacity', consultant_capacity_audit_log.over_capacity, 'client_id', consultant_capacity_audit_log.client_id) AS metadata,
    consultant_capacity_audit_log.created_at
   FROM consultant_capacity_audit_log
UNION ALL
 SELECT audit_invites.id,
    audit_invites.tenant_id,
        CASE
            WHEN audit_invites.actor_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text THEN audit_invites.actor_user_id::uuid
            ELSE NULL::uuid
        END AS actor_id,
    audit_invites.outcome AS action,
    'invite'::text AS domain,
    'invite'::text AS entity_type,
    audit_invites.email AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    jsonb_build_object('role', audit_invites.role, 'code', audit_invites.code, 'detail', audit_invites.detail, 'function_version', audit_invites.function_version, 'invite_attempts', audit_invites.invite_attempts) AS metadata,
    audit_invites.created_at
   FROM audit_invites
UNION ALL
 SELECT addin_audit_log.id,
    addin_audit_log.tenant_id,
    addin_audit_log.user_uuid AS actor_id,
    addin_audit_log.action,
    'addin'::text AS domain,
    COALESCE(addin_audit_log.record_type, 'addin'::text) AS entity_type,
    addin_audit_log.record_id AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(addin_audit_log.metadata, '{}'::jsonb) || jsonb_build_object('surface', addin_audit_log.surface, 'client_info', addin_audit_log.client_info) AS metadata,
    addin_audit_log.created_at
   FROM addin_audit_log
  WHERE addin_audit_log.tenant_id IS NOT NULL;

-- 1. Restore the FKs
ALTER TABLE public.eos_agenda_templates
  ADD CONSTRAINT eos_agenda_templates_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES public.eos_agenda_template_versions(id);
ALTER TABLE public.eos_meetings
  ADD CONSTRAINT eos_meetings_template_version_id_fkey
  FOREIGN KEY (template_version_id) REFERENCES public.eos_agenda_template_versions(id);

-- 0. Restore the 2 retired-type templates
INSERT INTO public.eos_agenda_templates
SELECT * FROM public._eos_retired_type_templates_backfill_20260723;

NOTIFY pgrst, 'reload schema';

COMMIT;
