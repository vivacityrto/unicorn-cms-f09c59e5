-- Phase 2.6 stabilization M4 — retire the workload forecast cron after
-- Carl's explicit decision (2026-09-08). The workload output is incomplete:
-- snapshots exist, but burn/risk/retention forecast tables remain empty.
--
-- This migration ONLY unschedules the exact cron job. It deliberately retains
-- the run-workload-forecast Edge Function, workload_snapshots, and all forecast
-- tables/rows for evidence and a separately approved replacement.
--
-- migration-target-project: yxkgdalkbrriasiyyrwk
--
-- Safe to replay where pg_cron is absent. Refuses to act if historical job ID
-- 14 has been reused by a different job, and verifies the named job is gone.

DO $$
DECLARE
  v_expected_name constant text := 'run-workload-forecast-nightly';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  ) THEN
    RAISE NOTICE 'M4: pg_cron is not installed; run-workload-forecast-nightly is already absent in this environment';
    RETURN;
  END IF;

  -- Never unschedule a job that has taken this historical ID unless its
  -- name still matches the job being retired.
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobid = 14
      AND jobname <> v_expected_name
  ) THEN
    RAISE EXCEPTION 'M4 refused: cron job ID 14 has been reused by another job';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = v_expected_name
  ) THEN
    PERFORM cron.unschedule(v_expected_name);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = v_expected_name
  ) THEN
    RAISE EXCEPTION 'M4 postflight failed: run-workload-forecast-nightly is still scheduled';
  END IF;

  RAISE NOTICE 'M4: retired run-workload-forecast-nightly (job ID 14); workload and forecast tables/functions retained';
END
$$;
