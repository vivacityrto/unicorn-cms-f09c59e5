-- Create Same Page Meeting templates for all tenants that don't have one
INSERT INTO public.eos_agenda_templates (
  tenant_id,
  meeting_type,
  template_name,
  description,
  segments,
  is_default,
  is_system,
  is_archived
)
SELECT DISTINCT
  t.id,
  'Same_Page'::eos_meeting_type,
  'Same Page Meeting',
  'EOS Same Page Meeting for Visionary and Integrator alignment. 120-minute structured discussion.',
  '[
    {"name": "Check-In", "duration": 10, "description": "Personal and professional updates between Visionary and Integrator."},
    {"name": "Review V/TO", "duration": 20, "description": "Confirm alignment on vision, values, and targets."},
    {"name": "Clarify Roles and Ownership", "duration": 20, "description": "Review Visionary vs Integrator responsibilities. Address any friction."},
    {"name": "Discuss Key Issues", "duration": 40, "description": "Open discussion on strategic concerns, people issues, and priorities."},
    {"name": "Align on Priorities", "duration": 20, "description": "Agree on top priorities for the upcoming period."},
    {"name": "Decisions and Next Steps", "duration": 10, "description": "Capture decisions, assign actions, confirm follow-up."}
  ]'::jsonb,
  true,
  true,
  false
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.eos_agenda_templates eat
  WHERE eat.tenant_id = t.id 
    AND eat.meeting_type = 'Same_Page' 
    AND eat.is_system = true 
    AND eat.is_archived = false
);

-- Create helper function to validate meeting agenda completeness
CREATE OR REPLACE FUNCTION public.validate_meeting_agenda(p_meeting_id UUID)
RETURNS TABLE(is_valid BOOLEAN, missing_segments TEXT[], error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting_type TEXT;
  v_required_segments TEXT[];
  v_actual_segments TEXT[];
  v_missing TEXT[];
BEGIN
  -- Get meeting type
  SELECT meeting_type::TEXT INTO v_meeting_type
  FROM public.eos_meetings
  WHERE id = p_meeting_id;

  IF v_meeting_type IS NULL THEN
    RETURN QUERY SELECT false, ARRAY[]::TEXT[], 'Meeting not found';
    RETURN;
  END IF;

  -- Define required segments for each EOS meeting type
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
      -- Custom/Focus_Day meetings don't have required segments
      RETURN QUERY SELECT true, ARRAY[]::TEXT[], NULL;
      RETURN;
  END CASE;

  -- Get actual segments for the meeting
  SELECT ARRAY_AGG(segment_name ORDER BY sequence_order)
  INTO v_actual_segments
  FROM public.eos_meeting_segments
  WHERE meeting_id = p_meeting_id;

  IF v_actual_segments IS NULL THEN
    RETURN QUERY SELECT false, v_required_segments, 'No agenda segments found. Meeting must be created from a system template.';
    RETURN;
  END IF;

  -- Find missing required segments (use case-insensitive partial matching)
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
$$;

-- Create function to start a meeting with validation
CREATE OR REPLACE FUNCTION public.start_meeting_with_validation(p_meeting_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation RECORD;
  v_first_segment_id UUID;
  v_meeting_type TEXT;
BEGIN
  -- Get meeting type
  SELECT meeting_type::TEXT INTO v_meeting_type
  FROM public.eos_meetings
  WHERE id = p_meeting_id;

  -- Only validate EOS meeting types
  IF v_meeting_type IN ('L10', 'Quarterly', 'Annual', 'Same_Page') THEN
    -- Validate agenda completeness
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

  -- Start the first segment
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
$$;

-- Update the seed function to include Same_Page
CREATE OR REPLACE FUNCTION public.seed_system_agenda_templates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
BEGIN
  FOR v_tenant IN SELECT DISTINCT id FROM public.tenants
  LOOP
    -- Level 10 Meeting (only if not exists)
    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, description, segments, is_default, is_system, is_archived
    )
    SELECT 
      v_tenant.id,
      'L10'::eos_meeting_type,
      'Level 10 Meeting',
      'EOS canonical 90-minute weekly execution meeting. Follows exact EOS Level 10 agenda structure.',
      '[
        {"name": "Segue", "duration": 5, "description": "Personal and business check-in. Share good news."},
        {"name": "Scorecard", "duration": 5, "description": "Review weekly metrics. Flag any out-of-range numbers."},
        {"name": "Rock Review", "duration": 5, "description": "Quick On-Track/Off-Track status for each Rock. No discussion."},
        {"name": "Headlines", "duration": 5, "description": "Customer/Employee headlines. Good news and FYIs."},
        {"name": "To-Do List", "duration": 5, "description": "Review last week To-Dos. Mark complete or carry forward."},
        {"name": "IDS", "duration": 60, "description": "Identify, Discuss, Solve. Work through prioritised issues one at a time."},
        {"name": "Conclude", "duration": 5, "description": "Recap To-Dos and cascading messages. Rate meeting 1-10."}
      ]'::jsonb,
      true, true, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.eos_agenda_templates
      WHERE tenant_id = v_tenant.id AND meeting_type = 'L10' AND is_system = true AND is_archived = false
    );

    -- Quarterly Meeting
    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, description, segments, is_default, is_system, is_archived
    )
    SELECT 
      v_tenant.id,
      'Quarterly'::eos_meeting_type,
      'Quarterly Meeting',
      'EOS canonical Quarterly planning and review meeting.',
      '[
        {"name": "Segue", "duration": 15, "description": "Check-in. Share personal and professional updates."},
        {"name": "Review Previous Flight Plan", "duration": 60, "description": "Review previous quarter Rocks. Score as complete or incomplete."},
        {"name": "Review Mission Control", "duration": 45, "description": "Review V/TO. Confirm vision, values, and targets."},
        {"name": "Establish Next Quarter Rocks", "duration": 90, "description": "Set 3-7 company Rocks for the upcoming quarter."},
        {"name": "Tackle Key Issues", "duration": 120, "description": "IDS on quarterly-level issues. Strategic problem solving."},
        {"name": "Next Steps", "duration": 45, "description": "Cascade messages, assign action items, confirm accountability."},
        {"name": "Conclude", "duration": 30, "description": "Summarise decisions. Rate the meeting. Schedule next quarterly."}
      ]'::jsonb,
      true, true, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.eos_agenda_templates
      WHERE tenant_id = v_tenant.id AND meeting_type = 'Quarterly' AND is_system = true AND is_archived = false
    );

    -- Annual Strategic Planning
    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, description, segments, is_default, is_system, is_archived
    )
    SELECT 
      v_tenant.id,
      'Annual'::eos_meeting_type,
      'Annual Strategic Planning',
      'EOS canonical Annual Planning meeting. Two-day strategic planning session.',
      '[
        {"name": "Day 1: Segue", "duration": 30, "description": "Check-in. Share personal and professional updates."},
        {"name": "Day 1: Review Previous Mission Control", "duration": 60, "description": "Review last year V/TO. Score annual goals."},
        {"name": "Day 1: Team Health", "duration": 90, "description": "Right People Right Seats. Address team dynamics."},
        {"name": "Day 1: SWOT/Issues List", "duration": 120, "description": "Strategic SWOT analysis. Build annual issues list."},
        {"name": "Day 1: Review Mission Control", "duration": 60, "description": "Update V/TO. Confirm 10-year target, 3-year picture."},
        {"name": "Day 2: Establish Next Quarter Rocks", "duration": 120, "description": "Set Q1 Rocks aligned with annual priorities."},
        {"name": "Day 2: Tackle Key Issues", "duration": 120, "description": "IDS on annual-level strategic issues."},
        {"name": "Day 2: Conclude", "duration": 30, "description": "Cascade messages. Rate meeting. Confirm next steps."}
      ]'::jsonb,
      true, true, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.eos_agenda_templates
      WHERE tenant_id = v_tenant.id AND meeting_type = 'Annual' AND is_system = true AND is_archived = false
    );

    -- Same Page Meeting
    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, description, segments, is_default, is_system, is_archived
    )
    SELECT 
      v_tenant.id,
      'Same_Page'::eos_meeting_type,
      'Same Page Meeting',
      'EOS Same Page Meeting for Visionary and Integrator alignment. 120-minute structured discussion.',
      '[
        {"name": "Check-In", "duration": 10, "description": "Personal and professional updates between Visionary and Integrator."},
        {"name": "Review V/TO", "duration": 20, "description": "Confirm alignment on vision, values, and targets."},
        {"name": "Clarify Roles and Ownership", "duration": 20, "description": "Review Visionary vs Integrator responsibilities. Address any friction."},
        {"name": "Discuss Key Issues", "duration": 40, "description": "Open discussion on strategic concerns, people issues, and priorities."},
        {"name": "Align on Priorities", "duration": 20, "description": "Agree on top priorities for the upcoming period."},
        {"name": "Decisions and Next Steps", "duration": 10, "description": "Capture decisions, assign actions, confirm follow-up."}
      ]'::jsonb,
      true, true, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.eos_agenda_templates
      WHERE tenant_id = v_tenant.id AND meeting_type = 'Same_Page' AND is_system = true AND is_archived = false
    );
  END LOOP;
END;
$$;