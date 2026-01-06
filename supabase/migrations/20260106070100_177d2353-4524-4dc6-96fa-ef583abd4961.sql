-- Clear tenant_id for all Team Users (SuperAdmin staff)
UPDATE public.users
SET tenant_id = NULL
WHERE (unicorn_role IN ('Super Admin', 'Team Member') 
       OR user_type IN ('Vivacity', 'Vivacity Team'))
  AND tenant_id IS NOT NULL;