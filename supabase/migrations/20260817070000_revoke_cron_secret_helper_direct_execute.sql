-- The function validates service_role internally and is called by Edge Functions
-- through their service-role client. Production retained explicit anon/authenticated
-- grants despite the original source migration's PUBLIC revoke.
REVOKE ALL ON FUNCTION public.cron_presented_secret_matches(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_presented_secret_matches(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.cron_presented_secret_matches(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cron_presented_secret_matches(text, text) TO service_role;
