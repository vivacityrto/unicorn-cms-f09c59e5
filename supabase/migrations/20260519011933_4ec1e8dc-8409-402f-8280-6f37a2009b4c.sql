-- ============================================================
-- PRE-FLIGHT SAFETY CHECKS
-- ============================================================
DO $$
DECLARE
  v_bad_values  integer;
  v_row_count   integer;
  v_exists      boolean;
BEGIN
  SELECT count(*) INTO v_bad_values
  FROM public.eos_todos
  WHERE status IS NOT NULL
    AND status::text NOT IN ('Open', 'Complete', 'Cancelled');
  IF v_bad_values > 0 THEN
    RAISE EXCEPTION 'Pre-flight failed: % eos_todos row(s) have status outside (Open,Complete,Cancelled)', v_bad_values;
  END IF;

  SELECT count(*) INTO v_row_count FROM public.eos_todos;
  IF v_row_count <> 17 THEN
    RAISE EXCEPTION 'Pre-flight failed: eos_todos row count is %, expected 17', v_row_count;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'dd_eos_todo_status'
  ) INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'Pre-flight failed: dd_eos_todo_status already exists';
  END IF;
END $$;

-- ============================================================
-- STEP 1: Create dd_eos_todo_status (dd_accounting_system shape exactly)
-- ============================================================
CREATE TABLE public.dd_eos_todo_status (
  id          serial      NOT NULL,
  value       text        NOT NULL,
  label       text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dd_eos_todo_status_pkey PRIMARY KEY (id),
  CONSTRAINT dd_eos_todo_status_value_key UNIQUE (value)
);

-- ============================================================
-- STEP 2: Seed rows — byte-identical to current enum labels
-- ============================================================
INSERT INTO public.dd_eos_todo_status (value, label, sort_order) VALUES
  ('Open',      'Open',      1),
  ('Complete',  'Complete',  2),
  ('Cancelled', 'Cancelled', 3);

-- ============================================================
-- STEP 3: RLS on dd_eos_todo_status
-- ============================================================
ALTER TABLE public.dd_eos_todo_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_eos_todo_status_select" ON public.dd_eos_todo_status
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "dd_eos_todo_status_insert" ON public.dd_eos_todo_status
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

CREATE POLICY "dd_eos_todo_status_update" ON public.dd_eos_todo_status
  FOR UPDATE TO authenticated USING (public.is_super_admin());

CREATE POLICY "dd_eos_todo_status_delete" ON public.dd_eos_todo_status
  FOR DELETE TO authenticated USING (public.is_super_admin());

-- ============================================================
-- STEP 4: Migrate eos_todos.status column
-- ============================================================
-- Drop dependent view (will be recreated unchanged below).
DROP VIEW IF EXISTS public.v_client_eos_summary;

ALTER TABLE public.eos_todos ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.eos_todos
  ALTER COLUMN status TYPE text USING status::text;

ALTER TABLE public.eos_todos
  ALTER COLUMN status SET DEFAULT 'Open'::text;

ALTER TABLE public.eos_todos
  ADD CONSTRAINT eos_todos_status_fkey
    FOREIGN KEY (status)
    REFERENCES public.dd_eos_todo_status(value)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- Recreate view with original definition (preserving pre-existing 'Done' bug; out of scope for Phase 5A).
CREATE VIEW public.v_client_eos_summary AS
SELECT t.id AS tenant_id,
    t.name AS client_name,
    ( SELECT count(*) AS count
           FROM eos_rocks er
          WHERE er.tenant_id = t.id) AS total_rocks,
    ( SELECT count(*) AS count
           FROM eos_rocks er
          WHERE er.tenant_id = t.id AND er.status = 'on_track'::text) AS rocks_on_track,
    ( SELECT count(*) AS count
           FROM eos_rocks er
          WHERE er.tenant_id = t.id AND er.status = 'off_track'::text) AS rocks_off_track,
    ( SELECT count(*) AS count
           FROM eos_rocks er
          WHERE er.tenant_id = t.id AND er.status = 'complete'::text) AS rocks_completed,
    ( SELECT count(*) AS count
           FROM eos_issues ei
          WHERE ei.tenant_id = t.id AND ei.deleted_at IS NULL) AS total_issues,
    ( SELECT count(*) AS count
           FROM eos_issues ei
          WHERE ei.tenant_id = t.id AND ei.status::text = 'Open'::text AND ei.deleted_at IS NULL) AS open_issues,
    ( SELECT count(*) AS count
           FROM eos_issues ei
          WHERE ei.tenant_id = t.id AND ei.status::text = 'Solved'::text AND ei.deleted_at IS NULL) AS solved_issues,
    ( SELECT count(*) AS count
           FROM eos_issues ei
          WHERE ei.tenant_id = t.id AND ei.item_type = 'Risk'::text AND ei.deleted_at IS NULL) AS risk_count,
    ( SELECT count(*) AS count
           FROM eos_issues ei
          WHERE ei.tenant_id = t.id AND ei.item_type = 'Opportunity'::text AND ei.deleted_at IS NULL) AS opportunity_count,
    ( SELECT count(*) AS count
           FROM eos_todos et
          WHERE et.tenant_id = t.id) AS total_todos,
    ( SELECT count(*) AS count
           FROM eos_todos et
          WHERE et.tenant_id = t.id AND et.status::text = 'Done'::text) AS completed_todos,
    ( SELECT count(*) AS count
           FROM eos_meetings em
          WHERE em.tenant_id = t.id) AS total_meetings,
    ( SELECT count(*) AS count
           FROM eos_meetings em
          WHERE em.tenant_id = t.id AND em.is_complete = true) AS completed_meetings
   FROM tenants t;

-- ============================================================
-- STEP 5: Retain legacy enum — do NOT drop or archive
-- ============================================================
COMMENT ON TYPE public.eos_todo_status IS
  'Legacy enum retained for rollback safety. Superseded by dd_eos_todo_status (Phase 5A, 19 May 2026). '
  'Do not drop until Phase 5Z cleanup is approved by Carl/Dave. '
  'No columns in any schema are still typed as this enum.';

-- ============================================================
-- POST-MIGRATION SAFETY CHECKS
-- ============================================================
DO $$
DECLARE
  v_lookup_count   integer;
  v_data_type      text;
  v_default        text;
  v_fk_exists      boolean;
  v_row_count      integer;
  v_invalid_fk     integer;
  v_enum_exists    boolean;
BEGIN
  SELECT count(*) INTO v_lookup_count FROM public.dd_eos_todo_status;
  IF v_lookup_count <> 3 THEN
    RAISE EXCEPTION 'Post-check failed: dd_eos_todo_status has % rows, expected 3', v_lookup_count;
  END IF;

  SELECT data_type, column_default
    INTO v_data_type, v_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'eos_todos' AND column_name = 'status';

  IF v_data_type <> 'text' THEN
    RAISE EXCEPTION 'Post-check failed: eos_todos.status type is %, expected text', v_data_type;
  END IF;

  IF v_default IS DISTINCT FROM '''Open''::text' THEN
    RAISE EXCEPTION 'Post-check failed: eos_todos.status default is %, expected ''Open''::text', v_default;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'eos_todos_status_fkey'
      AND conrelid = 'public.eos_todos'::regclass
  ) INTO v_fk_exists;
  IF NOT v_fk_exists THEN
    RAISE EXCEPTION 'Post-check failed: FK eos_todos_status_fkey is missing';
  END IF;

  SELECT count(*) INTO v_row_count FROM public.eos_todos;
  IF v_row_count <> 17 THEN
    RAISE EXCEPTION 'Post-check failed: eos_todos row count is %, expected 17', v_row_count;
  END IF;

  SELECT count(*) INTO v_invalid_fk
  FROM public.eos_todos t
  WHERE t.status IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.dd_eos_todo_status d WHERE d.value = t.status
    );
  IF v_invalid_fk > 0 THEN
    RAISE EXCEPTION 'Post-check failed: % eos_todos row(s) violate FK to dd_eos_todo_status', v_invalid_fk;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'eos_todo_status'
  ) INTO v_enum_exists;
  IF NOT v_enum_exists THEN
    RAISE EXCEPTION 'Post-check failed: legacy enum public.eos_todo_status is missing';
  END IF;
END $$;

-- ============================================================
-- ROLLBACK SQL (comment block — do not execute)
-- ============================================================
-- DROP VIEW IF EXISTS public.v_client_eos_summary;
-- ALTER TABLE public.eos_todos DROP CONSTRAINT IF EXISTS eos_todos_status_fkey;
-- ALTER TABLE public.eos_todos ALTER COLUMN status DROP DEFAULT;
-- ALTER TABLE public.eos_todos
--   ALTER COLUMN status TYPE public.eos_todo_status
--     USING status::public.eos_todo_status;
-- ALTER TABLE public.eos_todos
--   ALTER COLUMN status SET DEFAULT 'Open'::public.eos_todo_status;
-- DROP TABLE IF EXISTS public.dd_eos_todo_status;
-- -- Then recreate v_client_eos_summary with the same SELECT as above.