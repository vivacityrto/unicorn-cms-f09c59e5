SELECT cron.unschedule('generate-notifications-meetings');
SELECT cron.unschedule('generate-notifications-daily');

-- Verification query: SELECT jobid, jobname FROM cron.job WHERE command LIKE '%eyJ%'; expected 0 rows
-- (Run separately after migration completes)

-- Post-migration verification: confirm both jobs are gone
SELECT jobid, jobname FROM cron.job WHERE jobname IN ('generate-notifications-meetings', 'generate-notifications-daily');

-- Also verify no remaining jobs with hardcoded JWTs
SELECT jobid, jobname FROM cron.job WHERE command LIKE '%eyJ%';