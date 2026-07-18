-- Harden pg_cron: stop exposing cron.job to the authenticated role via the API.
begin;
revoke select on cron.job from authenticated;
commit;
notify pgrst, 'reload schema';
