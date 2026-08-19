-- Vault-backed storage for the bulk-generate worker's system-account session
-- (access_token + refresh_token + expires_at, JSON-encoded). Same pattern as
-- private.cron_function_jwt() / private.cron_invoke_secret() — the secret
-- itself lives in Supabase Vault, never in a plain table or committed file.
--
-- Unlike those two, this secret is *rotated*: the worker calls
-- set_bulk_generate_system_session() with a fresh access/refresh token pair
-- whenever it refreshes the system account's session (mirrors the Xero
-- oauth_tokens refresh pattern in xero-invoice-sync-all/index.ts). The
-- set function self-bootstraps: it creates the vault secret on first call,
-- updates it thereafter.
--
-- Purpose: lets bulk-generate-documents-worker authenticate downstream
-- staff-gated calls (repair_package_instance_stages, deliver-governance-document,
-- provision-tenant-sharepoint-folder, verify-compliance-folder,
-- check-tenant-sharepoint-liveness) as a real, auto-refreshing system user
-- instead of forwarding the initiating staff member's short-lived browser
-- session — so a long-running job no longer stalls when that session expires.
--
-- NOTE: superseded by the immediately-following migration
-- (20260819020100_bulk_generate_system_session_public_accessors.sql), which
-- moves these two functions from private to public schema — private.*
-- functions are never reachable via PostgREST .rpc() (every existing
-- private.* helper is only ever called from inside SQL, e.g. a cron job's
-- net.http_post command string, never from edge-function code). Kept as a
-- verbatim historical record of what was actually applied, in sequence.

CREATE OR REPLACE FUNCTION private.get_bulk_generate_system_session()
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

CREATE OR REPLACE FUNCTION private.set_bulk_generate_system_session(p_session text)
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

REVOKE ALL ON FUNCTION private.get_bulk_generate_system_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_bulk_generate_system_session() TO service_role;

REVOKE ALL ON FUNCTION private.set_bulk_generate_system_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.set_bulk_generate_system_session(text) TO service_role;
