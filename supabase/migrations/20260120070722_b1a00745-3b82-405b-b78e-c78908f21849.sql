
-- Clean up duplicate non-system templates that were created before
DELETE FROM public.eos_agenda_templates 
WHERE is_system = false 
AND template_name IN ('Default Level 10 Meeting', 'Default Quarterly Meeting', 'Default Annual Meeting (2-Day)');

-- Update the seed function with correct EOS agenda structures
CREATE OR REPLACE FUNCTION public.seed_system_agenda_templates(p_tenant_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level10_segments JSONB;
  v_quarterly_segments JSONB;
  v_annual_segments JSONB;
  v_template_id UUID;
  v_version_id UUID;
BEGIN
  -- Check if system templates already exist for this tenant
  IF EXISTS (
    SELECT 1 FROM eos_agenda_templates 
    WHERE tenant_id = p_tenant_id AND is_system = true
  ) THEN
    RETURN;
  END IF;

  -- Level 10 Meeting - EOS canonical 90-minute agenda
  v_level10_segments := '[
    {"name": "Segue", "duration": 5},
    {"name": "Scorecard", "duration": 5},
    {"name": "Rock Review", "duration": 5},
    {"name": "Customer/Employee Headlines", "duration": 5},
    {"name": "To-Do List", "duration": 5},
    {"name": "IDS (Identify, Discuss, Solve)", "duration": 60},
    {"name": "Conclude", "duration": 5}
  ]'::JSONB;

  -- Quarterly Meeting - Full-day strategic session
  v_quarterly_segments := '[
    {"name": "Segue", "duration": 15},
    {"name": "Review Previous Flight Plan", "duration": 45},
    {"name": "Review Mission Control", "duration": 60},
    {"name": "Establish Next Quarter''s Rocks", "duration": 90},
    {"name": "Tackle Key Issues", "duration": 120},
    {"name": "Next Steps", "duration": 30},
    {"name": "Conclude", "duration": 15}
  ]'::JSONB;

  -- Annual Strategic Planning - Two-day structure
  v_annual_segments := '[
    {"name": "Day 1: Segue", "duration": 15},
    {"name": "Day 1: Review Previous Mission Control", "duration": 60},
    {"name": "Day 1: Team Health", "duration": 45},
    {"name": "Day 1: SWOT/Issues List", "duration": 90},
    {"name": "Day 1: Review Mission Control", "duration": 120},
    {"name": "Day 2: Establish Next Quarter''s Rocks", "duration": 120},
    {"name": "Day 2: Tackle Key Issues", "duration": 180}
  ]'::JSONB;

  -- Insert Level 10 template
  v_template_id := gen_random_uuid();
  v_version_id := gen_random_uuid();
  
  INSERT INTO eos_agenda_templates (id, tenant_id, template_name, meeting_type, segments, is_default, is_system, is_archived, description, current_version_id)
  VALUES (
    v_template_id,
    p_tenant_id, 
    'Standard Level 10', 
    'L10', 
    v_level10_segments,
    true,
    true,
    false,
    'EOS canonical 90-minute weekly execution meeting agenda',
    v_version_id
  );
  
  INSERT INTO eos_agenda_template_versions (id, template_id, version_number, segments_snapshot, change_summary, is_published, created_by)
  VALUES (v_version_id, v_template_id, 1, v_level10_segments, 'Initial system template', true, NULL);

  -- Insert Quarterly template
  v_template_id := gen_random_uuid();
  v_version_id := gen_random_uuid();
  
  INSERT INTO eos_agenda_templates (id, tenant_id, template_name, meeting_type, segments, is_default, is_system, is_archived, description, current_version_id)
  VALUES (
    v_template_id,
    p_tenant_id, 
    'Standard Quarterly Meeting', 
    'Quarterly', 
    v_quarterly_segments,
    true,
    true,
    false,
    'Full-day strategic session to review progress and set next quarter Flight Plan',
    v_version_id
  );
  
  INSERT INTO eos_agenda_template_versions (id, template_id, version_number, segments_snapshot, change_summary, is_published, created_by)
  VALUES (v_version_id, v_template_id, 1, v_quarterly_segments, 'Initial system template', true, NULL);

  -- Insert Annual template
  v_template_id := gen_random_uuid();
  v_version_id := gen_random_uuid();
  
  INSERT INTO eos_agenda_templates (id, tenant_id, template_name, meeting_type, segments, is_default, is_system, is_archived, description, current_version_id)
  VALUES (
    v_template_id,
    p_tenant_id, 
    'Annual Strategic Planning', 
    'Annual', 
    v_annual_segments,
    true,
    true,
    false,
    'Two-day strategic planning covering Mission Control, long-term planning, and annual priorities',
    v_version_id
  );
  
  INSERT INTO eos_agenda_template_versions (id, template_id, version_number, segments_snapshot, change_summary, is_published, created_by)
  VALUES (v_version_id, v_template_id, 1, v_annual_segments, 'Initial system template', true, NULL);
END;
$$;

-- Update existing system templates with correct segments
UPDATE public.eos_agenda_templates
SET 
  segments = '[
    {"name": "Segue", "duration": 5},
    {"name": "Scorecard", "duration": 5},
    {"name": "Rock Review", "duration": 5},
    {"name": "Customer/Employee Headlines", "duration": 5},
    {"name": "To-Do List", "duration": 5},
    {"name": "IDS (Identify, Discuss, Solve)", "duration": 60},
    {"name": "Conclude", "duration": 5}
  ]'::JSONB,
  description = 'EOS canonical 90-minute weekly execution meeting agenda',
  updated_at = now()
WHERE is_system = true AND meeting_type = 'L10';

UPDATE public.eos_agenda_templates
SET 
  segments = '[
    {"name": "Segue", "duration": 15},
    {"name": "Review Previous Flight Plan", "duration": 45},
    {"name": "Review Mission Control", "duration": 60},
    {"name": "Establish Next Quarter''s Rocks", "duration": 90},
    {"name": "Tackle Key Issues", "duration": 120},
    {"name": "Next Steps", "duration": 30},
    {"name": "Conclude", "duration": 15}
  ]'::JSONB,
  description = 'Full-day strategic session to review progress and set next quarter Flight Plan',
  updated_at = now()
WHERE is_system = true AND meeting_type = 'Quarterly';

UPDATE public.eos_agenda_templates
SET 
  segments = '[
    {"name": "Day 1: Segue", "duration": 15},
    {"name": "Day 1: Review Previous Mission Control", "duration": 60},
    {"name": "Day 1: Team Health", "duration": 45},
    {"name": "Day 1: SWOT/Issues List", "duration": 90},
    {"name": "Day 1: Review Mission Control", "duration": 120},
    {"name": "Day 2: Establish Next Quarter''s Rocks", "duration": 120},
    {"name": "Day 2: Tackle Key Issues", "duration": 180}
  ]'::JSONB,
  description = 'Two-day strategic planning covering Mission Control, long-term planning, and annual priorities',
  updated_at = now()
WHERE is_system = true AND meeting_type = 'Annual';

-- Update corresponding version snapshots
UPDATE public.eos_agenda_template_versions v
SET segments_snapshot = t.segments
FROM public.eos_agenda_templates t
WHERE v.template_id = t.id 
AND t.is_system = true 
AND v.version_number = 1;
