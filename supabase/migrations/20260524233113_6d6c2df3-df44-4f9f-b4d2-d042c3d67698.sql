UPDATE public.audit_client_impersonation
SET ended_at = started_at + INTERVAL '4 hours'
WHERE ended_at IS NULL
  AND started_at < NOW() - INTERVAL '4 hours';

SELECT cron.schedule(
  'close-stale-preview-sessions',
  '0 */4 * * *',
  $$
    UPDATE public.audit_client_impersonation
    SET ended_at = started_at + INTERVAL '4 hours'
    WHERE ended_at IS NULL
      AND started_at < NOW() - INTERVAL '4 hours';
  $$
);