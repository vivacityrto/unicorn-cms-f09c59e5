-- Vault-backed helper so pg_cron can send x-cron-invoke-secret on
-- net.http_post calls. The secret value itself is created out-of-band
-- via vault.create_secret (never committed in git). This function only
-- reads it — same pattern as private.cron_function_jwt().
--
-- Applied before the separate cron.job DML migration that starts
-- sending the header. Edge functions accept both the existing
-- Authorization JWT and the new header during that transition.

CREATE OR REPLACE FUNCTION private.cron_invoke_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_invoke_secret'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.cron_invoke_secret() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.cron_invoke_secret() TO postgres;
GRANT EXECUTE ON FUNCTION private.cron_invoke_secret() TO service_role;
