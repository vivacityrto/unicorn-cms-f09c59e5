-- Add unique constraint on clickup_tasks.task_id for upsert support
ALTER TABLE public.clickup_tasks ADD CONSTRAINT clickup_tasks_task_id_unique UNIQUE (task_id);