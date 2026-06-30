BEGIN;

-- =========================================================
-- Phase F — CHECK constraint
-- =========================================================

DO $$
DECLARE v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.stage_instances
  WHERE status NOT IN (
    'not_started','in_progress','completed','core_complete',
    'na','blocked','monitor','closed'
  );
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'Phase F aborted: % non-canonical status rows present', v_bad;
  END IF;
END $$;

ALTER TABLE public.stage_instances
  ADD CONSTRAINT chk_stage_instances_status_valid
  CHECK (status IN (
    'not_started','in_progress','completed','core_complete',
    'na','blocked','monitor','closed'
  ))
  NOT VALID;

ALTER TABLE public.stage_instances
  VALIDATE CONSTRAINT chk_stage_instances_status_valid;

-- =========================================================
-- Phase G — Deprecate status_id and dd_stage_state
-- =========================================================

-- G1. Drop the now-unused index on status_id
DROP INDEX IF EXISTS public.idx_stage_instances_status_id;

-- G2. Null out status_id values
UPDATE public.stage_instances
   SET status_id = NULL
 WHERE status_id IS NOT NULL;

-- G3. Archive dd_stage_state (pre-check: no non-internal dependents)
DO $$
DECLARE v_dep bigint;
BEGIN
  SELECT count(*) INTO v_dep
  FROM pg_depend d
  JOIN pg_class c ON c.oid = d.refobjid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'dd_stage_state'
    AND n.nspname = 'public'
    AND d.deptype NOT IN ('i','a');
  IF v_dep <> 0 THEN
    RAISE EXCEPTION 'Phase G aborted: % external dependents on dd_stage_state', v_dep;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS archive;
ALTER TABLE public.dd_stage_state SET SCHEMA archive;

-- G4. Drop the status_id column (sanity-assert column exists first)
DO $$
BEGIN
  PERFORM 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'stage_instances'
    AND column_name  = 'status_id';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Phase G aborted: stage_instances.status_id column missing before DROP';
  END IF;
END $$;

ALTER TABLE public.stage_instances DROP COLUMN status_id;

-- G5. Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;