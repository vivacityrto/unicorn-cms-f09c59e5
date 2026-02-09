
-- 1. Add dedupe_key column to user_notifications
ALTER TABLE public.user_notifications
ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_dedupe_key_uq
ON public.user_notifications (dedupe_key);

-- 2. Add performance index on tasks_tenants
CREATE INDEX IF NOT EXISTS idx_tasks_tenants_due_date
ON public.tasks_tenants (due_date)
WHERE due_date IS NOT NULL AND (completed IS NULL OR completed = false);

-- 3. Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
