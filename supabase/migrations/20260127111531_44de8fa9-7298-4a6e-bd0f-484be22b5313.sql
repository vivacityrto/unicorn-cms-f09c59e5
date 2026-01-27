-- Truncate public.stage_instances (confirmed 0 records, safe)
TRUNCATE TABLE public.stage_instances;

-- Copy stage_instances from unicorn1, preserving legacy IDs
INSERT INTO public.stage_instances (
  id,
  stage_id,
  package_instance_id,
  completion_date,
  paid,
  released_client_tasks,
  released_client_tasks_date,
  status
)
SELECT 
  id,
  stage_id,
  packageinstance_id,
  completiondate,
  paid,
  releasedclienttasks,
  releasedclienttasksdate,
  status
FROM unicorn1.stage_instances;

-- Reset sequence to prevent ID conflicts
SELECT setval(
  pg_get_serial_sequence('public.stage_instances', 'id'),
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.stage_instances),
  false
);