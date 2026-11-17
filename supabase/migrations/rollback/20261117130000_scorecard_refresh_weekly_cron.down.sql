-- Rollback for 20261117130000_scorecard_refresh_weekly_cron.sql
-- migration-target-project: yxkgdalkbrriasiyyrwk
-- Removes only the weekly job. Entries it already wrote are kept.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'scorecard-refresh-weekly';
