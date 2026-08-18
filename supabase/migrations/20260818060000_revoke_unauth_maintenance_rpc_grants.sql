-- Revoke authenticated/anon EXECUTE on two maintenance RPCs that have no
-- internal authorization check of their own.
--
-- Found via a spot-check sample of the ~429 functions the security advisor
-- flags as "SECURITY DEFINER, callable by authenticated" -- most of that
-- list is the expected pattern (a function deliberately exposed to
-- `authenticated` that performs its own internal auth.uid()/check_permission
-- check). These two are the exception: genuine one-off maintenance/backfill
-- helpers with zero internal check, left reachable by any signed-in user via
-- supabase.rpc(...).
--
-- backfill_l10_meeting_participants(): loops over EVERY EOS L10 meeting in
-- the system (all tenants) and writes participant rows -- any authenticated
-- user could trigger a system-wide data mutation.
--
-- cleanup_old_rate_limits(): deletes AI rate-limit tracking rows older than
-- 2 hours -- any authenticated user could call this to reset/bypass AI rate
-- limiting for themselves or others.
--
-- Neither has a pg_cron job or any other caller found (checked cron.job and
-- grepped src/ + supabase/functions/**). Revoking authenticated/anon EXECUTE
-- rather than adding an internal check or dropping outright: both remain
-- callable by service_role/postgres for a future scheduled job or manual
-- admin invocation via the SQL editor.
REVOKE EXECUTE ON FUNCTION public.backfill_l10_meeting_participants() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_l10_meeting_participants() FROM anon;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_rate_limits() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_rate_limits() FROM anon;
