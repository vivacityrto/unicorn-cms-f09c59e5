-- FIX A + B: data update for existing L10 active templates and refreshed seed functions.

WITH src AS (
  SELECT
    t.id,
    t.segments,
    (SELECT ord FROM jsonb_array_elements(t.segments) WITH ORDINALITY AS e(elem, ord)
       WHERE elem->>'name' = 'IDS (Identify, Discuss, Solve)' LIMIT 1) AS ids_ord,
    (SELECT ord FROM jsonb_array_elements(t.segments) WITH ORDINALITY AS e(elem, ord)
       WHERE elem->>'name' = 'Customer/Employee Headlines' LIMIT 1) AS hl_ord
  FROM public.eos_agenda_templates t
  WHERE t.meeting_type = 'L10' AND t.is_archived = false
),
rebuilt AS (
  SELECT
    s.id,
    (
      SELECT jsonb_agg(
               CASE WHEN e.elem->>'name' = 'Conclude'
                    THEN jsonb_set(e.elem, '{name}', '"Conclude / One Phrase Close"'::jsonb)
                    ELSE e.elem
               END
               ORDER BY
                 CASE
                   WHEN s.ids_ord IS NOT NULL AND s.hl_ord IS NOT NULL AND s.ids_ord < s.hl_ord THEN
                     CASE
                       WHEN e.ord = s.ids_ord THEN s.hl_ord
                       WHEN e.ord = s.hl_ord THEN s.ids_ord
                       ELSE e.ord
                     END
                   ELSE e.ord
                 END
             )
      FROM jsonb_array_elements(s.segments) WITH ORDINALITY AS e(elem, ord)
    ) AS new_segments
  FROM src s
)
UPDATE public.eos_agenda_templates t
SET segments = r.new_segments
FROM rebuilt r
WHERE t.id = r.id
  AND r.new_segments IS NOT NULL
  AND r.new_segments <> t.segments;

-- Refresh seed function: no-arg overload
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

-- Refresh seed function: per-tenant overload
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