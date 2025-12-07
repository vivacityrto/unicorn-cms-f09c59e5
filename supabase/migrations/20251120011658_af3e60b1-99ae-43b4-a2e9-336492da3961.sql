-- Add assigned_to column to tasks_tenants table
ALTER TABLE public.tasks_tenants 
ADD COLUMN assigned_to uuid REFERENCES auth.users(id);

-- Add index for better query performance
CREATE INDEX idx_tasks_tenants_assigned_to ON public.tasks_tenants(assigned_to);

-- Add comment
COMMENT ON COLUMN public.tasks_tenants.assigned_to IS 'User to whom the task is assigned';