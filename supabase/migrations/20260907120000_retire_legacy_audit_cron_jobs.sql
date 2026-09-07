-- M2 — retire the obsolete audit-reminder cron jobs after product-owner
-- confirmation. This migration deliberately leaves the notification tables
-- and helper functions in place: current notification queue/outbox code still
-- references those tables.
-- migration-target-project: yxkgdalkbrriasiyyrwk
--
-- The migration is safe to replay in a project without pg_cron. It only
-- unschedules the exact named jobs below and fails closed if their current IDs
-- have been reused for a different job.

DO $$
DECLARE
  v_job record;
  v_expected_names constant text[] := ARRAY[
    'audit-24hr-confirmation',
    'audit-evidence-reminders',
    'audit-flag-overdue-chcs'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  ) THEN
    RAISE NOTICE 'M2: pg_cron is not installed; legacy audit jobs are already absent in this environment';
    RETURN;
  END IF;

  -- Never unschedule a job that has taken one of the historical IDs unless
  -- its name still matches the approved retirement set.
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobid IN (4, 5, 6)
      AND jobname <> ALL (v_expected_names)
  ) THEN
    RAISE EXCEPTION 'M2 refused: cron job IDs 4–6 have been reused by another job';
  END IF;

  FOR v_job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname = ANY (v_expected_names)
  LOOP
    PERFORM cron.unschedule(v_job.jobname);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = ANY (v_expected_names)
  ) THEN
    RAISE EXCEPTION 'M2 postflight failed: one or more legacy audit jobs remain scheduled';
  END IF;

  RAISE NOTICE 'M2: retired legacy audit jobs 4–6 (audit-24hr-confirmation, audit-evidence-reminders, audit-flag-overdue-chcs)';
END
$$;
