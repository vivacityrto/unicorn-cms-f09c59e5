-- STATUS (2026-08-06): attempted against prod via the `postgres` role
-- (Supabase MCP apply_migration). pg_net is confirmed non-relocatable on
-- this project, and the fallback below (flipping pg_extension.extrelocatable)
-- itself fails with "permission denied for table pg_extension" — `postgres`
-- is not a superuser and not a member of `supabase_admin` (the extension's
-- owner) here, so it cannot modify that catalog directly. Not applied.
-- Needs either a Supabase Support ticket or the Dashboard's Database →
-- Extensions UI (which runs with Supabase's own internal privileged
-- connection) to actually move pg_net. Superseded duplicate
-- (20260805051457, same intent, no exception handling) removed in favour
-- of keeping this more complete version for whoever picks this up next.
--
-- Same privilege wall as 20260805051037_revoke_cron_job_select_from_api_roles_reassert.sql
-- (that one was accepted as a deferred risk on 2026-08-06, not ticketed).
-- Unlike that one, this still shows as an open advisor finding
-- (extension_in_public) — worth its own call on whether to ticket it, and
-- if so, bundling the cron.job revoke into the same ticket.
--
-- Security Fix: relocate pg_net out of public into the dedicated extensions
-- schema (Supabase database linter 0014_extension_in_public / splinter).
--
-- Documented pattern:
--   CREATE SCHEMA IF NOT EXISTS extensions;
--   ALTER EXTENSION pg_net SET SCHEMA extensions;
--
-- pg_net is unusual: it owns its own `net` schema and installs callables
-- there (net.http_post, net.http_get, …). Moving the extension's
-- extnamespace to `extensions` does NOT rename those callables to
-- extensions.http_post — callers must keep using net.http_post(...).
-- All cron.job commands and trigger helpers in this project already
-- schema-qualify net.http_post, so they resolve independently of search_path.
--
-- Managed Supabase marks pg_net as non-relocatable (extrelocatable=false).
-- When that flag blocks ALTER EXTENSION … SET SCHEMA, temporarily flip it
-- for the move (same procedure Supabase support uses for this case), then
-- restore the flag.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
DECLARE
  current_schema text;
  was_relocatable boolean;
BEGIN
  SELECT n.nspname, e.extrelocatable
  INTO current_schema, was_relocatable
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_net';

  IF current_schema IS NULL THEN
    RAISE EXCEPTION 'pg_net is not installed; cannot relocate';
  END IF;

  IF current_schema = 'extensions' THEN
    RAISE NOTICE 'pg_net already installed in extensions schema; skipping relocate';
    RETURN;
  END IF;

  IF current_schema <> 'public' THEN
    RAISE EXCEPTION
      'pg_net is in unexpected schema "%" (expected public or extensions)',
      current_schema;
  END IF;

  BEGIN
    ALTER EXTENSION pg_net SET SCHEMA extensions;
  EXCEPTION
    WHEN feature_not_supported THEN
      -- Non-relocatable install (typical on managed Supabase):
      -- "extension pg_net does not support SET SCHEMA".
      UPDATE pg_extension
      SET extrelocatable = true
      WHERE extname = 'pg_net';

      ALTER EXTENSION pg_net SET SCHEMA extensions;

      UPDATE pg_extension
      SET extrelocatable = was_relocatable
      WHERE extname = 'pg_net';
  END;
END $$;

-- Post-move checks: extension home schema, net.http_post still present,
-- cron jobs 8–25 (and any other http_post cron commands) still resolve via
-- net.http_post, and cron-executing roles keep extensions on search_path.
DO $$
DECLARE
  ext_schema text;
  bad_jobs text;
  role_name text;
  role_search_path text;
  roles_to_check text[] := ARRAY['postgres', 'supabase_admin'];
  http_post_jobs_in_band int;
  net_http_post_jobs_in_band int;
BEGIN
  SELECT n.nspname
  INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_net';

  IF ext_schema IS DISTINCT FROM 'extensions' THEN
    RAISE EXCEPTION
      'expected pg_net extnamespace = extensions, found %',
      coalesce(ext_schema, '<missing>');
  END IF;

  -- pg_net keeps its API in schema net (not extensions).
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'net'
      AND p.proname = 'http_post'
  ) THEN
    RAISE EXCEPTION 'net.http_post(...) missing after pg_net relocate';
  END IF;

  -- Cron jobs invoke Edge Functions via net.http_post in the command text.
  -- Jobs 8–25 are the historical net.http_post band; also reject any other
  -- http_post cron command that is not schema-qualified as net.http_post.
  -- Do NOT rewrite callers to extensions.http_post — that is incorrect for pg_net.
  SELECT string_agg(jobid::text || ':' || coalesce(jobname, '<unnamed>'), ', ' ORDER BY jobid)
  INTO bad_jobs
  FROM cron.job
  WHERE command ILIKE '%http_post%'
    AND command NOT ILIKE '%net.http_post%'
    AND command NOT ILIKE '%"net"."http_post"%';

  IF bad_jobs IS NOT NULL THEN
    RAISE EXCEPTION
      'cron.job http_post callers must use net.http_post (not extensions.http_post / unqualified). Bad jobs: %',
      bad_jobs;
  END IF;

  SELECT
    count(*) FILTER (
      WHERE command ILIKE '%http_post%'
    ),
    count(*) FILTER (
      WHERE command ILIKE '%net.http_post%'
         OR command ILIKE '%"net"."http_post"%'
    )
  INTO http_post_jobs_in_band, net_http_post_jobs_in_band
  FROM cron.job
  WHERE jobid BETWEEN 8 AND 25;

  IF http_post_jobs_in_band > 0 AND net_http_post_jobs_in_band = 0 THEN
    RAISE EXCEPTION
      'cron.job ids 8–25 contain http_post but none resolve as net.http_post';
  END IF;

  IF http_post_jobs_in_band > 0 AND net_http_post_jobs_in_band <> http_post_jobs_in_band THEN
    RAISE EXCEPTION
      'cron.job ids 8–25: % http_post command(s) but only % use net.http_post',
      http_post_jobs_in_band,
      net_http_post_jobs_in_band;
  END IF;

  FOREACH role_name IN ARRAY roles_to_check
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      CONTINUE;
    END IF;

    SELECT (
      SELECT option_value
      FROM pg_options_to_table(r.rolconfig) AS opt(option_name, option_value)
      WHERE option_name = 'search_path'
      LIMIT 1
    )
    INTO role_search_path
    FROM pg_roles r
    WHERE r.rolname = role_name;

    IF role_search_path IS NULL THEN
      -- No role-level override. Supabase defaults include extensions for
      -- postgres; cron bodies already schema-qualify net.http_post.
      RAISE NOTICE
        'role % has no explicit search_path; net.http_post remains schema-qualified in cron commands',
        role_name;
      CONTINUE;
    END IF;

    IF position('extensions' in role_search_path) = 0 THEN
      RAISE EXCEPTION
        'role % search_path (%) does not include extensions after pg_net relocate',
        role_name,
        role_search_path;
    END IF;
  END LOOP;
END $$;

COMMIT;
