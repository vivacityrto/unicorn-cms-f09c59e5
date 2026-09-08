-- Phase 2.6 stabilization M4 — retire the remaining forecast cron jobs after
-- Carl's explicit decision (2026-09-08). The jobs have produced no forecast
-- rows, and the replacement metric contract belongs to Client Health.
--
-- This migration ONLY unschedules the exact cron jobs. It deliberately retains
-- the Edge Functions, snapshot/forecast tables, and all rows as evidence and
-- for a separately approved replacement. It contains no production URL.
-- migration-target-project: yxkgdalkbrriasiyyrwk
--
-- Safe to replay where pg_cron is absent. Refuses to act if either historical
-- job ID has been reused by a different job, and verifies both named jobs are
-- gone afterward.

DO $$
DECLARE
  v_risk_name constant text := 'run-tenant-risk-forecast-nightly';
  v_retention_name constant text := 'run-retention-forecast-nightly';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    RAISE NOTICE 'M4: pg_cron is not installed; forecast cron jobs are already absent in this environment';
    RETURN;
  END IF;

  -- Never unschedule a job that has taken either historical ID unless its
  -- name still matches the job being retired.
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobid = 20 AND jobname <> v_risk_name
  ) THEN
    RAISE EXCEPTION 'M4 refused: cron job ID 20 has been reused by another job';
  END IF;

  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobid = 21 AND jobname <> v_retention_name
  ) THEN
    RAISE EXCEPTION 'M4 refused: cron job ID 21 has been reused by another job';
  END IF;

  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = v_risk_name AND jobid <> 20
  ) THEN
    RAISE EXCEPTION 'M4 refused: risk forecast job name is attached to an unexpected ID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = v_retention_name AND jobid <> 21
  ) THEN
    RAISE EXCEPTION 'M4 refused: retention forecast job name is attached to an unexpected ID';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_risk_name) THEN
    PERFORM cron.unschedule(v_risk_name);
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_retention_name) THEN
    PERFORM cron.unschedule(v_retention_name);
  END IF;

  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname IN (v_risk_name, v_retention_name)
  ) THEN
    RAISE EXCEPTION 'M4 postflight failed: a forecast cron job is still scheduled';
  END IF;

  RAISE NOTICE 'M4: retired forecast cron jobs 20 and 21; functions, tables, and rows retained';
END
$$;
