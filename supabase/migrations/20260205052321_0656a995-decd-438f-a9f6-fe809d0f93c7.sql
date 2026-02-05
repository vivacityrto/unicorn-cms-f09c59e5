-- Drop old category constraint
ALTER TABLE public.processes 
DROP CONSTRAINT IF EXISTS processes_category_check;

-- Add new constraint with all 10 categories
ALTER TABLE public.processes 
ADD CONSTRAINT processes_category_check 
CHECK (category IN (
  'eos',
  'operations', 
  'compliance', 
  'client_delivery',
  'sales_marketing',
  'finance',
  'hr_people',
  'it_systems',
  'governance',
  'risk_management'
));

-- Drop old applies_to constraint
ALTER TABLE public.processes 
DROP CONSTRAINT IF EXISTS processes_applies_to_check;

-- Add new applies_to constraint aligned with frontend
ALTER TABLE public.processes 
ADD CONSTRAINT processes_applies_to_check 
CHECK (applies_to IN (
  'vivacity_internal', 
  'all_clients', 
  'specific_client'
));