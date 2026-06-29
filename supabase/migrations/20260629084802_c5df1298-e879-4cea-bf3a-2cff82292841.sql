ALTER TABLE public.tasks_tenants
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS milestones jsonb;