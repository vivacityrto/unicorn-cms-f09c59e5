-- Correction: private.* functions are never reachable via PostgREST .rpc()
-- (every existing private.* helper — cron_function_jwt, cron_invoke_secret —
-- is only ever called from *inside* SQL, e.g. a cron job's net.http_post
-- command string, never from edge-function code). The bulk-generate worker
-- needs to call these over PostgREST via the service-role client, so they
-- must live in public schema instead, locked down purely by REVOKE/GRANT
-- (no anon/authenticated grant at all — service_role only). Same body as
-- the private.* versions from the prior migration; those are dropped.

DROP FUNCTION IF EXISTS private.get_bulk_generate_system_session();
DROP FUNCTION IF EXISTS private.set_bulk_generate_system_session(text);

CREATE OR REPLACE FUNCTION public.get_bulk_generate_system_session()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'bulk_generate_system_session'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_bulk_generate_system_session(p_session text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'bulk_generate_system_session' LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(
      p_session,
      'bulk_generate_system_session',
      'bulk-generate-documents-worker system-account session (access_token+refresh_token+expires_at JSON), rotated on each refresh.'
    );
  ELSE
    PERFORM vault.update_secret(v_id, p_session);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_bulk_generate_system_session() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_bulk_generate_system_session() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulk_generate_system_session() TO service_role;

REVOKE ALL ON FUNCTION public.set_bulk_generate_system_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_bulk_generate_system_session(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_bulk_generate_system_session(text) TO service_role;
