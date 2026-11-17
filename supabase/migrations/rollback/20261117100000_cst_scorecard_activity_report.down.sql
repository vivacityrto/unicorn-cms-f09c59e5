-- Rollback for 20261117100000_cst_scorecard_activity_report.sql
-- Removes the CST report functions, the weekly snapshot table (and its data),
-- and the weekly job. Nothing else depends on these objects: no existing table,
-- function or policy was changed by the migration. The snapshot table is
-- derived data and can be rebuilt with backfill_cst_snapshots() after a re-apply.

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cst-scorecard-weekly-snapshot';
  END IF;
END
$cron$;

DROP FUNCTION IF EXISTS public.get_cst_team_metric(text, date);
DROP FUNCTION IF EXISTS public.backfill_cst_snapshots(integer);
DROP FUNCTION IF EXISTS public.snapshot_cst_week(date);
DROP TABLE IF EXISTS public.cst_scorecard_weekly_snapshot;
DROP FUNCTION IF EXISTS public.get_cst_report(text, date);
DROP FUNCTION IF EXISTS public.cst_activity_stats(timestamptz, timestamptz);
