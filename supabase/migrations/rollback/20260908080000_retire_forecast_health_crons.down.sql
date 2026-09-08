-- M4 rollback: restore forecast schedules only after an explicit operator
-- decision. This script is disabled by default and contains no project URL.
-- Set both session settings immediately before running it, then verify the
-- result against the approved target project.
-- migration-target-project: yxkgdalkbrriasiyyrwk

DO $$
DECLARE
  v_risk_url text := current_setting('app.tenant_risk_forecast_cron_url', true);
  v_retention_url text := current_setting('app.retention_forecast_cron_url', true);
BEGIN
  IF current_setting('app.allow_forecast_health_cron_restore', true) <> 'true' THEN
    RAISE EXCEPTION 'M4 rollback refused: set app.allow_forecast_health_cron_restore=true for an explicit restore';
  END IF;

  IF v_risk_url IS NULL OR v_risk_url = '' OR v_risk_url NOT LIKE 'https://%/functions/v1/run-tenant-risk-forecast' THEN
    RAISE EXCEPTION 'M4 rollback refused: set app.tenant_risk_forecast_cron_url to the approved target function URL';
  END IF;

  IF v_retention_url IS NULL OR v_retention_url = '' OR v_retention_url NOT LIKE 'https://%/functions/v1/run-retention-forecast' THEN
    RAISE EXCEPTION 'M4 rollback refused: set app.retention_forecast_cron_url to the approved target function URL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname IN ('run-tenant-risk-forecast-nightly', 'run-retention-forecast-nightly')
  ) THEN
    RAISE EXCEPTION 'M4 rollback refused: a forecast cron job is already scheduled';
  END IF;

  PERFORM cron.schedule(
    'run-tenant-risk-forecast-nightly',
    '0 13 * * *',
    format($command$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || private.cron_function_jwt(),
          'x-cron-invoke-secret', private.cron_invoke_secret()
        ),
        body := '{}'::jsonb
      )
    $command$, v_risk_url)
  );

  PERFORM cron.schedule(
    'run-retention-forecast-nightly',
    '0 14 * * *',
    format($command$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || private.cron_function_jwt(),
          'x-cron-invoke-secret', private.cron_invoke_secret()
        ),
        body := '{}'::jsonb
      )
    $command$, v_retention_url)
  );
END
$$;
