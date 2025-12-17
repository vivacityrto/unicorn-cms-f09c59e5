-- Drop the dependent trigger first
DROP TRIGGER IF EXISTS task_assignment_email_automation ON public.tasks_tenants;

-- Drop the trigger function if it exists
DROP FUNCTION IF EXISTS public.notify_task_assignment();

-- Add followers column to tasks_tenants table
ALTER TABLE public.tasks_tenants 
ADD COLUMN IF NOT EXISTS followers uuid[] DEFAULT '{}';

-- Migrate existing assigned_to data to followers array
UPDATE public.tasks_tenants 
SET followers = ARRAY[assigned_to]
WHERE assigned_to IS NOT NULL AND (followers IS NULL OR followers = '{}');

-- Drop the old assigned_to column
ALTER TABLE public.tasks_tenants 
DROP COLUMN IF EXISTS assigned_to;