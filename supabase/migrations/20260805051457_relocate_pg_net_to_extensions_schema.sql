-- Relocate pg_net out of public into the dedicated extensions schema.
-- Resolves Supabase security advisor 0014_extension_in_public for pg_net.
--
-- Documented pattern:
--   CREATE SCHEMA IF NOT EXISTS extensions;
--   ALTER EXTENSION pg_net SET SCHEMA extensions;
--
-- pg_net keeps its callable API in the dedicated `net` schema
-- (net.http_post / net.http_get / queue tables) regardless of where the
-- extension is registered. Cron jobs 8–25 and trigger helpers call
-- schema-qualified net.http_post(...), so they continue to resolve after
-- the move without search_path changes or rewriting to extensions.http_post.
--
-- Note: some hosted pg_net builds are marked extrelocatable=false. If
-- ALTER EXTENSION fails with that error, Supabase Support must temporarily
-- flip the relocatable flag (same sequence used for managed PostGIS moves).

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
DECLARE
  current_schema name;
BEGIN
  SELECT n.nspname
  INTO current_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_net';

  IF current_schema IS NULL THEN
    RAISE NOTICE 'pg_net is not installed; skipping ALTER EXTENSION';
    RETURN;
  END IF;

  IF current_schema = 'extensions' THEN
    RAISE NOTICE 'pg_net already registered in extensions; nothing to move';
    RETURN;
  END IF;

  IF current_schema <> 'public' THEN
    RAISE EXCEPTION
      'pg_net is registered in unexpected schema "%" (expected public or extensions)',
      current_schema;
  END IF;

  EXECUTE 'ALTER EXTENSION pg_net SET SCHEMA extensions';
END $$;

-- Re-check: extension registration, net.http_post resolution, cron jobs 8–25.
DO $$
DECLARE
  ext_schema name;
  broken_jobs text;
  http_post_jobs int;
BEGIN
  SELECT n.nspname
  INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_net';

  IF ext_schema IS NOT NULL AND ext_schema <> 'extensions' THEN
    RAISE EXCEPTION
      'expected pg_net extnamespace = extensions after relocate, got %',
      ext_schema;
  END IF;

  -- Primary path: callables remain in schema net.
  IF to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NOT NULL THEN
    SELECT count(*)::int
    INTO http_post_jobs
    FROM cron.job
    WHERE jobid BETWEEN 8 AND 25
      AND command ILIKE '%net.http_post%';

    SELECT string_agg(jobid::text || ':' || coalesce(jobname, '?'), ', ' ORDER BY jobid)
    INTO broken_jobs
    FROM cron.job
    WHERE jobid BETWEEN 8 AND 25
      AND command ILIKE '%http_post%'
      AND command NOT ILIKE '%net.http_post%'
      AND command NOT ILIKE '%extensions.http_post%';

    IF broken_jobs IS NOT NULL THEN
      RAISE EXCEPTION
        'cron.job rows 8–25 reference http_post without net/extensions qualify: %',
        broken_jobs;
    END IF;

    RAISE NOTICE
      'pg_net in extensions; net.http_post resolves; % cron.job row(s) in 8–25 call net.http_post',
      http_post_jobs;
    RETURN;
  END IF;

  -- Fallback: only if a recreate installed callables under extensions.
  IF to_regprocedure('extensions.http_post(text, jsonb, jsonb, jsonb, integer)') IS NULL THEN
    RAISE EXCEPTION
      'neither net.http_post(...) nor extensions.http_post(...) resolved after pg_net relocate';
  END IF;

  UPDATE cron.job
  SET command = replace(command, 'net.http_post', 'extensions.http_post')
  WHERE jobid BETWEEN 8 AND 25
    AND command LIKE '%net.http_post%';

  RAISE NOTICE
    'net.http_post missing after relocate; rewrote matching cron.job rows 8–25 to extensions.http_post';
END $$;

COMMIT;
