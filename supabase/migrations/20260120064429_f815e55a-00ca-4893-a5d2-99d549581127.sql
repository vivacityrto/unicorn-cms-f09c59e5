-- Add is_system and is_archived columns to eos_agenda_templates
ALTER TABLE public.eos_agenda_templates 
ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS description TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_eos_agenda_templates_meeting_type ON public.eos_agenda_templates(meeting_type);
CREATE INDEX IF NOT EXISTS idx_eos_agenda_templates_is_archived ON public.eos_agenda_templates(is_archived);
CREATE INDEX IF NOT EXISTS idx_eos_agenda_templates_is_system ON public.eos_agenda_templates(is_system);

-- Function to seed system templates for a tenant (called automatically)
CREATE OR REPLACE FUNCTION public.seed_system_agenda_templates(p_tenant_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_l10_segments JSONB := '[
    {"name": "Segue", "duration_minutes": 5},
    {"name": "Scorecard", "duration_minutes": 5},
    {"name": "Rock Review", "duration_minutes": 5},
    {"name": "Risks and Opportunities", "duration_minutes": 5},
    {"name": "To-Dos", "duration_minutes": 5},
    {"name": "IDS (Identify, Discuss, Solve)", "duration_minutes": 60},
    {"name": "Conclude", "duration_minutes": 5}
  ]';
  
  v_quarterly_segments JSONB := '[
    {"name": "Check-in", "duration_minutes": 15},
    {"name": "Previous Quarter Review", "duration_minutes": 60},
    {"name": "Rock Close/Roll Review", "duration_minutes": 45},
    {"name": "V/TO Review", "duration_minutes": 30},
    {"name": "Lunch Break", "duration_minutes": 60},
    {"name": "New Rock Planning", "duration_minutes": 90},
    {"name": "Flight Plan Confirmation", "duration_minutes": 45},
    {"name": "Scorecard Targets Review", "duration_minutes": 30},
    {"name": "Conclude", "duration_minutes": 30}
  ]';
  
  v_annual_segments JSONB := '[
    {"name": "Day 1: Check-in and Vision Review", "duration_minutes": 60},
    {"name": "Day 1: 10-Year Target Review", "duration_minutes": 45},
    {"name": "Day 1: 3-Year Picture Update", "duration_minutes": 90},
    {"name": "Day 1: Lunch", "duration_minutes": 60},
    {"name": "Day 1: 1-Year Plan Development", "duration_minutes": 120},
    {"name": "Day 1: Strategic Risks & Opportunities", "duration_minutes": 60},
    {"name": "Day 1: Wrap-up", "duration_minutes": 30},
    {"name": "Day 2: Check-in", "duration_minutes": 30},
    {"name": "Day 2: Accountability Chart Review", "duration_minutes": 90},
    {"name": "Day 2: Annual Priorities", "duration_minutes": 60},
    {"name": "Day 2: Lunch", "duration_minutes": 60},
    {"name": "Day 2: Quarterly Rock Planning", "duration_minutes": 90},
    {"name": "Day 2: Issues and IDS", "duration_minutes": 60},
    {"name": "Day 2: Conclude and Next Steps", "duration_minutes": 45}
  ]';
BEGIN
  -- Only seed if no system templates exist for this tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.eos_agenda_templates 
    WHERE tenant_id = p_tenant_id AND is_system = true
  ) THEN
    -- Seed Level 10 template
    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, description, segments, is_default, is_system
    ) VALUES (
      p_tenant_id, 
      'L10', 
      'Standard Level 10', 
      'EOS canonical 90-minute weekly execution meeting agenda',
      v_l10_segments,
      true,
      true
    );
    
    -- Seed Quarterly template
    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, description, segments, is_default, is_system
    ) VALUES (
      p_tenant_id, 
      'Quarterly', 
      'Standard Quarterly Meeting', 
      'Full-day strategic session to review progress and set next quarter Flight Plan',
      v_quarterly_segments,
      true,
      true
    );
    
    -- Seed Annual template
    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, description, segments, is_default, is_system
    ) VALUES (
      p_tenant_id, 
      'Annual', 
      'Annual Strategic Planning', 
      'Two-day strategic planning covering V/TO, long-term planning, and annual priorities',
      v_annual_segments,
      true,
      true
    );
  END IF;
END;
$$;

-- Seed system templates for all existing tenants that don't have them
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_system_agenda_templates(t.id);
  END LOOP;
END;
$$;

-- Create trigger to auto-seed for new tenants
CREATE OR REPLACE FUNCTION public.auto_seed_agenda_templates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_system_agenda_templates(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_agenda_templates_on_tenant_create ON public.tenants;
CREATE TRIGGER seed_agenda_templates_on_tenant_create
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_seed_agenda_templates();