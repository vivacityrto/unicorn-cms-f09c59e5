-- Seed default Level 10 agenda template
-- This will create a standard L10 template for each tenant that doesn't have one

INSERT INTO public.eos_agenda_templates (
  tenant_id,
  meeting_type,
  template_name,
  segments,
  is_default
)
SELECT 
  t.id as tenant_id,
  'L10'::public.eos_meeting_type,
  'Standard Level 10',
  jsonb_build_array(
    jsonb_build_object('name', 'Segue', 'duration_minutes', 5),
    jsonb_build_object('name', 'Scorecard', 'duration_minutes', 5),
    jsonb_build_object('name', 'Rock Review', 'duration_minutes', 5),
    jsonb_build_object('name', 'Customer/Employee Headlines', 'duration_minutes', 5),
    jsonb_build_object('name', 'To-Do List', 'duration_minutes', 5),
    jsonb_build_object('name', 'IDS (Identify, Discuss, Solve)', 'duration_minutes', 60),
    jsonb_build_object('name', 'Conclude', 'duration_minutes', 5)
  ),
  true
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.eos_agenda_templates eat
  WHERE eat.tenant_id = t.id AND eat.is_default = true
);