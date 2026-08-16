-- DML on cron.job via cron.alter_job (direct UPDATE is denied for
-- postgres). Add x-cron-invoke-secret to every HTTP cron command that
-- already sends private.cron_function_jwt().
--
-- MUST be applied AFTER the affected edge functions are deployed
-- accepting both the existing Authorization JWT and the new header.
-- Jobs that invoke functions not yet checking the header are unharmed
-- — extra request headers are ignored.
--
-- Live inventory at write time: 15 HTTP jobs. Two quoting styles exist;
-- both replaces run on each command. Idempotent: skips jobs that already
-- call private.cron_invoke_secret().

DO $$
DECLARE
  r record;
  new_cmd text;
BEGIN
  FOR r IN
    SELECT jobid, command
    FROM cron.job
    WHERE command LIKE '%cron_function_jwt%'
      AND command NOT LIKE '%cron_invoke_secret%'
  LOOP
    new_cmd := replace(
      r.command,
      $auth$'Authorization', 'Bearer ' || private.cron_function_jwt()$auth$,
      $auth$'Authorization', 'Bearer ' || private.cron_function_jwt(),
        'x-cron-invoke-secret', private.cron_invoke_secret()$auth$
    );
    new_cmd := replace(
      new_cmd,
      $auth$'Authorization','Bearer '||private.cron_function_jwt()$auth$,
      $auth$'Authorization','Bearer '||private.cron_function_jwt(),'x-cron-invoke-secret',private.cron_invoke_secret()$auth$
    );
    IF new_cmd IS DISTINCT FROM r.command THEN
      PERFORM cron.alter_job(r.jobid, command := new_cmd);
    END IF;
  END LOOP;
END $$;
