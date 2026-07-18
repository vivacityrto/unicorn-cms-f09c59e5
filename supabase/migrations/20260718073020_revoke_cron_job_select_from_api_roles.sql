-- Harden pg_cron: stop exposing cron.job to API-facing roles.
-- Scheduled jobs still run as the job owner (typically postgres), not as
-- the revoked roles, so pg_cron execution is unaffected.
BEGIN;

revoke select on cron.job from public;
revoke select on cron.job from authenticated;
revoke select on cron.job from anon;

NOTIFY pgrst, 'reload schema';

-- Confirm the revoke took effect before committing.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'cron.job', 'SELECT') THEN
    RAISE EXCEPTION 'expected has_table_privilege(authenticated, cron.job, SELECT) = false';
  END IF;
  IF has_table_privilege('anon', 'cron.job', 'SELECT') THEN
    RAISE EXCEPTION 'expected has_table_privilege(anon, cron.job, SELECT) = false';
  END IF;
  IF has_table_privilege('public', 'cron.job', 'SELECT') THEN
    RAISE EXCEPTION 'expected has_table_privilege(public, cron.job, SELECT) = false';
  END IF;
END $$;

COMMIT;
