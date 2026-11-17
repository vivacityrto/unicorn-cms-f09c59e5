-- Weekly refresh of the scorecard's automatic metrics for the Vivacity tenant (6372).
-- migration-target-project: yxkgdalkbrriasiyyrwk
--
-- Calls the scorecard-refresh edge function every Monday at 04:00 Sydney
-- (Sunday 17:00 UTC; 03:00 Sydney in winter). That is after the weekly CST
-- snapshot job (cst-scorecard-weekly-snapshot, Sunday 16:30 UTC), so the
-- snapshot for the week that just ended exists when the CST metrics read it.
-- The function's default week is the last completed week (keyed by its Monday).
--
-- Auth matches the other cron-only functions: the service-role bearer and the
-- x-cron-invoke-secret header, both read from vault through private helpers.
--
-- Entries need a real user in entered_by (a required foreign key to
-- auth.users) and no scorecard system account exists, so the job passes
-- actor_user_id. It is resolved when this migration runs and stored in the
-- job command; to change who system entries are recorded against, re-run this
-- migration after changing the lookup, or reschedule the job.

DO $cron$
DECLARE
  v_actor uuid;
BEGIN
  SELECT u.user_uuid INTO v_actor
  FROM public.users u
  WHERE u.first_name = 'Carl' AND u.last_name = 'Simpao' AND u.unicorn_role = 'Super Admin'
    AND u.is_vivacity_internal
    AND COALESCE(u.archived, false) = false AND COALESCE(u.disabled, false) = false
  LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No active user to record scorecard system entries against';
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'scorecard-refresh-weekly';

  PERFORM cron.schedule(
    'scorecard-refresh-weekly',
    '0 17 * * 0',
    format($job$
      SELECT net.http_post(
        url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/scorecard-refresh',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || private.cron_function_jwt(),
          'x-cron-invoke-secret', private.cron_invoke_secret()
        ),
        body := jsonb_build_object('tenant_id', 6372, 'actor_user_id', %L),
        timeout_milliseconds := 60000
      ) AS request_id;
    $job$, v_actor)
  );
END
$cron$;
