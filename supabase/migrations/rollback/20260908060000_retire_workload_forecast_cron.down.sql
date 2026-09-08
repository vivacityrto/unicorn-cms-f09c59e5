-- M4 rollback: restore the workload forecast schedule only after an explicit
-- operator decision. This script is disabled by default and does not contain
-- a project URL. Set both session settings for the intended non-production or
-- production target immediately before running it, then verify the result.
-- migration-target-project: yxkgdalkbrriasiyyrwk

DO $$
DECLARE
  v_url text := current_setting('app.workload_forecast_cron_url', true);
BEGIN
  IF current_setting('app.allow_workload_forecast_cron_restore', true) <> 'true' THEN
    RAISE EXCEPTION 'M4 rollback refused: set app.allow_workload_forecast_cron_restore=true for an explicit restore';
  END IF;

  IF v_url IS NULL OR v_url = '' OR v_url NOT LIKE 'https://%/functions/v1/run-workload-forecast' THEN
    RAISE EXCEPTION 'M4 rollback refused: set app.workload_forecast_cron_url to the approved target function URL';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-workload-forecast-nightly') THEN
    RAISE EXCEPTION 'M4 rollback refused: run-workload-forecast-nightly is already scheduled';
  END IF;

  PERFORM cron.schedule(
    'run-workload-forecast-nightly',
    '0 16 * * *',
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
    $command$, v_url)
  );
END
$$;
