-- DML on cron.job: add x-cron-invoke-secret to every HTTP cron command
-- that already sends private.cron_function_jwt().
--
-- MUST be applied AFTER the affected edge functions are deployed
-- accepting both the existing Authorization JWT and the new header.
-- Jobs that invoke functions not yet checking the header are unharmed
-- — extra request headers are ignored.
--
-- Live inventory at write time: 15 HTTP jobs. Two quoting styles exist;
-- each UPDATE targets one.

UPDATE cron.job
SET command = replace(
  command,
  $auth$'Authorization', 'Bearer ' || private.cron_function_jwt()$auth$,
  $auth$'Authorization', 'Bearer ' || private.cron_function_jwt(),
        'x-cron-invoke-secret', private.cron_invoke_secret()$auth$
)
WHERE command LIKE $auth$%'Authorization', 'Bearer ' || private.cron_function_jwt()%$auth$;

UPDATE cron.job
SET command = replace(
  command,
  $auth$'Authorization','Bearer '||private.cron_function_jwt()$auth$,
  $auth$'Authorization','Bearer '||private.cron_function_jwt(),'x-cron-invoke-secret',private.cron_invoke_secret()$auth$
)
WHERE command LIKE $auth$%'Authorization','Bearer '||private.cron_function_jwt()%$auth$;
