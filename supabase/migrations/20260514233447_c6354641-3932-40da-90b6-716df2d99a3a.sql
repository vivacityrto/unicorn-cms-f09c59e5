-- Step 1: Clear the existing notification backlog
-- Mark all currently queued rows as skipped so stale notifications are not delivered.
-- New rows inserted after this migration will start as 'queued' (column default) and are unaffected.

UPDATE public.notification_outbox
SET
  status = 'skipped',
  sent_at = now(),
  last_error = 'Backlog cleared before cron activation (15 May 2026)'
WHERE status = 'queued';

-- Step 2: Create the cron job to process the outbox every 5 minutes
SELECT cron.schedule(
  'process-notification-outbox',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/process-notification-outbox',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || private.cron_function_jwt()
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);