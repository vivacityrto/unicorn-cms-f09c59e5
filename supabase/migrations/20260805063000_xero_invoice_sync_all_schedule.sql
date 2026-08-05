SELECT cron.schedule(
  'xero-invoice-sync-all-every-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/xero-invoice-sync-all',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || private.cron_function_jwt()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);
