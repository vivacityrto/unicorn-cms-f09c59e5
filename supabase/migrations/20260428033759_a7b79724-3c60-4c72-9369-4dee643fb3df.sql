
-- ============================================================
-- Migration D: Schedule VALIDATE CONSTRAINT for 108 user_uuid FKs
-- Off-peak AEST window: 22:00-04:00 AEST (12:00-18:00 UTC)
-- ============================================================

-- 1. Audit log table for validation runs
CREATE TABLE IF NOT EXISTS public.fk_validation_runs (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  constraint_name text NOT NULL,
  table_name text NOT NULL,
  status text NOT NULL, -- 'success' | 'error' | 'skipped'
  duration_ms integer,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fk_validation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fk_validation_runs_superadmin_read"
ON public.fk_validation_runs FOR SELECT TO authenticated
USING (public.is_vivacity());

CREATE INDEX IF NOT EXISTS idx_fk_validation_runs_run_id ON public.fk_validation_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_fk_validation_runs_started_at ON public.fk_validation_runs(started_at DESC);

-- 2. Validation function — loops all unvalidated FKs referencing public.users
CREATE OR REPLACE FUNCTION public.run_user_uuid_fk_validation()
RETURNS TABLE(total integer, succeeded integer, failed integer, run_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_run_id uuid := gen_random_uuid();
  v_total integer := 0;
  v_succeeded integer := 0;
  v_failed integer := 0;
  v_start timestamptz;
  v_end timestamptz;
  rec record;
BEGIN
  FOR rec IN
    SELECT c.conname AS constraint_name,
           n.nspname || '.' || t.relname AS table_name
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.users'::regclass
      AND NOT c.convalidated
    ORDER BY t.relname, c.conname
  LOOP
    v_total := v_total + 1;
    v_start := clock_timestamp();
    BEGIN
      EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I',
                     rec.table_name, rec.constraint_name);
      v_end := clock_timestamp();
      v_succeeded := v_succeeded + 1;
      INSERT INTO public.fk_validation_runs
        (run_id, constraint_name, table_name, status, duration_ms, started_at, finished_at)
      VALUES
        (v_run_id, rec.constraint_name, rec.table_name, 'success',
         EXTRACT(MILLISECOND FROM (v_end - v_start))::integer + EXTRACT(SECOND FROM (v_end - v_start))::integer * 1000,
         v_start, v_end);
    EXCEPTION WHEN OTHERS THEN
      v_end := clock_timestamp();
      v_failed := v_failed + 1;
      INSERT INTO public.fk_validation_runs
        (run_id, constraint_name, table_name, status, duration_ms, error_message, started_at, finished_at)
      VALUES
        (v_run_id, rec.constraint_name, rec.table_name, 'error',
         EXTRACT(MILLISECOND FROM (v_end - v_start))::integer + EXTRACT(SECOND FROM (v_end - v_start))::integer * 1000,
         SQLERRM, v_start, v_end);
    END;
  END LOOP;

  RETURN QUERY SELECT v_total, v_succeeded, v_failed, v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.run_user_uuid_fk_validation() FROM PUBLIC;

-- 3. Rollback function — re-marks validated constraints as NOT VALID
-- Use only if validation surfaces data integrity issues that need investigation
CREATE OR REPLACE FUNCTION public.rollback_user_uuid_fk_validation(p_run_id uuid DEFAULT NULL)
RETURNS TABLE(reverted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_count integer := 0;
  rec record;
BEGIN
  -- Only Vivacity SuperAdmins may invoke
  IF NOT public.is_vivacity() THEN
    RAISE EXCEPTION 'Unauthorized: SuperAdmin only';
  END IF;

  -- Note: Postgres has no direct "INVALIDATE CONSTRAINT". Rollback strategy:
  -- DROP and re-ADD the FK as NOT VALID using stored definition from fk_validation_runs.
  -- For simplicity here, we log the rollback intent; manual DROP/ADD per constraint is required.
  -- This stub exists so the rollback path is documented and discoverable.
  FOR rec IN
    SELECT DISTINCT constraint_name, table_name
    FROM public.fk_validation_runs
    WHERE status = 'success'
      AND (p_run_id IS NULL OR run_id = p_run_id)
  LOOP
    v_count := v_count + 1;
    INSERT INTO public.fk_validation_runs
      (run_id, constraint_name, table_name, status, error_message)
    VALUES
      (COALESCE(p_run_id, gen_random_uuid()), rec.constraint_name, rec.table_name,
       'rollback_requested',
       'Manual DROP + re-ADD as NOT VALID required. See migration history for original definition.');
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_user_uuid_fk_validation(uuid) FROM PUBLIC;

-- 4. Schedule pg_cron job for next off-peak AEST window
-- Tonight: 12:30 UTC = 22:30 AEST (Tue 28 Apr 2026)
-- Cron format: 'minute hour day month dow' (UTC)
-- Schedule once: 30 12 28 4 * — runs at 12:30 UTC on 28 April
SELECT cron.schedule(
  'validate-user-uuid-fks-offpeak',
  '30 12 28 4 *',
  $cron$
    SELECT public.run_user_uuid_fk_validation();
    SELECT cron.unschedule('validate-user-uuid-fks-offpeak');
  $cron$
);

COMMENT ON FUNCTION public.run_user_uuid_fk_validation() IS
  'Migration D: Validates all NOT VALID FKs referencing public.users(user_uuid). Logs each constraint to fk_validation_runs. Each VALIDATE CONSTRAINT takes only a SHARE UPDATE EXCLUSIVE lock — does not block reads/writes. Failures are logged, loop continues.';

COMMENT ON FUNCTION public.rollback_user_uuid_fk_validation(uuid) IS
  'Rollback path for Migration D. Logs rollback intent per constraint. Actual rollback requires manual DROP CONSTRAINT + ADD CONSTRAINT ... NOT VALID per FK using definitions from migration history.';
