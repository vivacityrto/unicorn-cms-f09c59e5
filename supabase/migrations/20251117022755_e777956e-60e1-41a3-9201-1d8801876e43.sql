-- Remove client_id column and foreign key from tasks_tenants
ALTER TABLE public.tasks_tenants 
DROP COLUMN IF EXISTS client_id;