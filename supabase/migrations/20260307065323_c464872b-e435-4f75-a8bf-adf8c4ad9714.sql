ALTER TABLE public.staff_task_instances
  ADD COLUMN IF NOT EXISTS completed_by uuid;