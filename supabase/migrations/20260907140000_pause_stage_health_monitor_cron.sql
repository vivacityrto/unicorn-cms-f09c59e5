-- Phase 2.6 stabilization Packet P3-A item 1 (H0.0 containment) — pause the
-- nightly stage-health cron after Carl's explicit decision (2026-09-07):
-- the current stage-health metric is known-defective (see
-- docs/kb/reference/client-health-activity-analytics-plan-2026-09-03.md,
-- section 1 "Executive decision" and section 5 "Live findings") and will be
-- superseded by the new client-health plan rather than kept running for
-- forensic continuity.
--
-- This migration ONLY unschedules the cron trigger. It deliberately does
-- NOT drop the run-stage-health-monitor Edge Function (can still be invoked
-- manually) or the stage_health_snapshots table/rows (retained as raw
-- evidence per H0.0's "retain the operational triage workflow and raw
-- evidence links" requirement).
--
-- migration-target-project: yxkgdalkbrriasiyyrwk
--
-- Safe to replay in a project without pg_cron. Only unschedules the exact
-- named job below and fails closed if its current ID has been reused for a
-- different job.

DO $$
DECLARE
  v_expected_name constant text := 'run-stage-health-monitor-nightly';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  ) THEN
    RAISE NOTICE 'P3-A H0.0: pg_cron is not installed; run-stage-health-monitor-nightly is already absent in this environment';
    RETURN;
  END IF;

  -- Never unschedule a job that has taken this historical ID unless its
  -- name still matches the job being paused.
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobid = 15
      AND jobname <> v_expected_name
  ) THEN
    RAISE EXCEPTION 'P3-A H0.0 refused: cron job ID 15 has been reused by another job';
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
    RAISE EXCEPTION 'P3-A H0.0 postflight failed: run-stage-health-monitor-nightly is still scheduled';
  END IF;

  RAISE NOTICE 'P3-A H0.0: paused run-stage-health-monitor-nightly (job id 15) — stage_health_snapshots and the Edge Function are retained';
END
$$;
