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
    {"name": "To-Do List", "duration": 5},
    {"name": "IDS (Identify, Discuss, Solve)", "duration": 60},
    {"name": "Conclude", "duration": 5}
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

  -- Level 10
  v_template_id := gen_random_uuid();
  v_version_id := gen_random_uuid();
  
  INSERT INTO eos_agenda_templates (id, tenant_id, template_name, meeting_type, segments, is_default, is_system, is_archived, description)
  VALUES (v_template_id, p_tenant_id, 'Standard Level 10', 'L10', v_level10_segments, true, true, false, 'EOS canonical 90-minute weekly execution meeting agenda');
  
  INSERT INTO eos_agenda_template_versions (id, template_id, version_number, segments_snapshot, change_summary, is_published, created_by)
  VALUES (v_version_id, v_template_id, 1, v_level10_segments, 'Initial system template', true, NULL);

  UPDATE eos_agenda_templates SET current_version_id = v_version_id WHERE id = v_template_id;

  -- Quarterly
  v_template_id := gen_random_uuid();
  v_version_id := gen_random_uuid();
  
  INSERT INTO eos_agenda_templates (id, tenant_id, template_name, meeting_type, segments, is_default, is_system, is_archived, description)
  VALUES (v_template_id, p_tenant_id, 'Standard Quarterly Meeting', 'Quarterly', v_quarterly_segments, true, true, false, 'Full-day strategic session to review progress and set next quarter Flight Plan');
  
  INSERT INTO eos_agenda_template_versions (id, template_id, version_number, segments_snapshot, change_summary, is_published, created_by)
  VALUES (v_version_id, v_template_id, 1, v_quarterly_segments, 'Initial system template', true, NULL);

  UPDATE eos_agenda_templates SET current_version_id = v_version_id WHERE id = v_template_id;

  -- Annual
  v_template_id := gen_random_uuid();
  v_version_id := gen_random_uuid();
  
  INSERT INTO eos_agenda_templates (id, tenant_id, template_name, meeting_type, segments, is_default, is_system, is_archived, description)
  VALUES (v_template_id, p_tenant_id, 'Annual Strategic Planning', 'Annual', v_annual_segments, true, true, false, 'Two-day strategic planning covering Mission Control, long-term planning, and annual priorities');
  
  INSERT INTO eos_agenda_template_versions (id, template_id, version_number, segments_snapshot, change_summary, is_published, created_by)
  VALUES (v_version_id, v_template_id, 1, v_annual_segments, 'Initial system template', true, NULL);

  UPDATE eos_agenda_templates SET current_version_id = v_version_id WHERE id = v_template_id;
END;
$function$;