-- Drop the old function and create the new one with all three meeting types
DROP FUNCTION IF EXISTS public.seed_quarterly_annual_templates();

CREATE OR REPLACE FUNCTION public.seed_default_meeting_templates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id BIGINT;
  v_tenant RECORD;
BEGIN
  -- Seed templates for ALL tenants
  FOR v_tenant IN SELECT id FROM public.tenants
  LOOP
    v_tenant_id := v_tenant.id;
    
    -- L10 (Level 10) Default Template
    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, segments, is_default
    ) VALUES (
      v_tenant_id,
      'L10',
      'Default Level 10 Meeting',
      '[
        {"name": "Segue (Good News)", "duration_minutes": 5},
        {"name": "Scorecard Review", "duration_minutes": 5},
        {"name": "Rock Review", "duration_minutes": 5},
        {"name": "Headlines", "duration_minutes": 5},
        {"name": "To-Dos Review", "duration_minutes": 5},
        {"name": "IDS (Identify, Discuss, Solve)", "duration_minutes": 60},
        {"name": "Conclude & Rate", "duration_minutes": 5}
      ]'::jsonb,
      true
    )
    ON CONFLICT DO NOTHING;

    -- Quarterly Default Template
    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, segments, is_default
    ) VALUES (
      v_tenant_id,
      'Quarterly',
      'Default Quarterly Meeting',
      '[
        {"name": "Segue & Win Check-in", "duration_minutes": 15},
        {"name": "Scorecard Review (13-week trends)", "duration_minutes": 30},
        {"name": "Rock Review (Quarter Retrospective)", "duration_minutes": 45},
        {"name": "Customer/Employee Headlines", "duration_minutes": 20},
        {"name": "Issues Parking Lot", "duration_minutes": 15},
        {"name": "V/TO Review (1-Year Plan)", "duration_minutes": 45},
        {"name": "Set Next-Quarter Rocks", "duration_minutes": 90},
        {"name": "Prioritize Issues & IDS", "duration_minutes": 90},
        {"name": "Accountability Chart Updates", "duration_minutes": 30},
        {"name": "Cascading Messages & To-Dos", "duration_minutes": 15},
        {"name": "Conclude & Rate", "duration_minutes": 10}
      ]'::jsonb,
      true
    )
    ON CONFLICT DO NOTHING;

    -- Annual Default Template
    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, segments, is_default
    ) VALUES (
      v_tenant_id,
      'Annual',
      'Default Annual Meeting (2-Day)',
      '[
        {"name": "Day 1: Company Review", "duration_minutes": 45},
        {"name": "Day 1: Rock Year-End Retrospective", "duration_minutes": 45},
        {"name": "Day 1: Team Health / People Analyzer", "duration_minutes": 45},
        {"name": "Day 1: SWOT / Issues List", "duration_minutes": 60},
        {"name": "Day 1: Three-Year Picture Refresh", "duration_minutes": 60},
        {"name": "Day 1: One-Year Plan", "duration_minutes": 60},
        {"name": "Day 2: Accountability Chart (Future Org)", "duration_minutes": 45},
        {"name": "Day 2: Set Company Rocks", "duration_minutes": 75},
        {"name": "Day 2: Prioritize Issues & IDS", "duration_minutes": 90},
        {"name": "Day 2: Cascading Messages & To-Dos", "duration_minutes": 30},
        {"name": "Day 2: Conclude & Rate", "duration_minutes": 10}
      ]'::jsonb,
      true
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$function$;

-- Execute the function to seed templates for all existing tenants
SELECT public.seed_default_meeting_templates();