-- Create Brisbane Safe Work Training Pty Ltd tenant with slug
INSERT INTO public.tenants (name, slug, status)
SELECT 
  'Brisbane Safe Work Training Pty Ltd', 
  'brisbane-safe-work-training-pty-ltd',
  'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenants 
  WHERE name = 'Brisbane Safe Work Training Pty Ltd'
);

-- Update the tasks with correct tenant_ids
UPDATE public.tasks_tenants 
SET tenant_id = (SELECT id FROM public.tenants WHERE name = 'Brisbane Safe Work Training Pty Ltd' LIMIT 1)
WHERE task_name = 'EMAIL: Eligible Business Structures';

UPDATE public.tasks_tenants 
SET tenant_id = 114
WHERE task_name = 'Australian National Education College';

UPDATE public.tasks_tenants 
SET tenant_id = 122
WHERE task_name = 'Evolve Learning Institute';