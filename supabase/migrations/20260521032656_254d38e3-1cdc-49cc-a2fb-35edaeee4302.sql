-- Schedule sync-outlook-calendar fan-out every 30 minutes.
-- Idempotent: unschedule first if present.
DO $$
BEGIN
  PERFORM cron.unschedule('sync-outlook-calendar-every-30min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'sync-outlook-calendar-every-30min',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/sync-outlook-calendar-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || private.cron_function_jwt()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $cron$
);