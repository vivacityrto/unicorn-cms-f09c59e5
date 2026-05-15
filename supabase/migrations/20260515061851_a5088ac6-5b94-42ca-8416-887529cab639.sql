-- Phase 4A: staff_team_type enum -> dd_staff_team lookup table

-- 1. CREATE LOOKUP TABLE
CREATE TABLE public.dd_staff_team (
  id          serial      PRIMARY KEY,
  value       text        NOT NULL UNIQUE,
  label       text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. SEED (byte-identical to enum labels)
INSERT INTO public.dd_staff_team (value, label, sort_order) VALUES
  ('none',                 'None',                 1),
  ('business_growth',      'Business Growth',      2),
  ('client_success',       'Client Success',       3),
  ('client_experience',    'Client Experience',    4),
  ('software_development', 'Software Development', 5),
  ('leadership',           'Leadership',           6);

-- 3. RLS — public read, writes via service role only
ALTER TABLE public.dd_staff_team ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_staff_team is publicly readable"
  ON public.dd_staff_team
  FOR SELECT
  USING (true);

-- 4. SAFETY PRE-FLIGHT
DO $$
DECLARE
  v_total_rows      bigint;
  v_non_null_rows   bigint;
  v_invalid_rows    bigint;
  v_archive_typname text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE staff_team IS NOT NULL)
    INTO v_total_rows, v_non_null_rows
  FROM public.users;

  PERFORM set_config('phase4a.total_rows',    v_total_rows::text,    false);
  PERFORM set_config('phase4a.non_null_rows', v_non_null_rows::text, false);
  PERFORM set_config('phase4a.null_rows',     (v_total_rows - v_non_null_rows)::text, false);

  -- Defensive: every existing non-NULL value must be in the seed
  SELECT count(*) INTO v_invalid_rows
  FROM public.users u
  WHERE u.staff_team IS NOT NULL
    AND u.staff_team::text NOT IN (SELECT value FROM public.dd_staff_team);

  IF v_invalid_rows > 0 THEN
    RAISE EXCEPTION 'Phase 4A pre-flight FAILED: % rows in public.users have staff_team values not present in dd_staff_team seed', v_invalid_rows;
  END IF;

  -- Confirm archive.backup_users.staff_team is still typed as the legacy enum
  SELECT t.typname INTO v_archive_typname
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE n.nspname = 'archive'
    AND c.relname = 'backup_users'
    AND a.attname = 'staff_team'
    AND a.attnum  > 0
    AND NOT a.attisdropped;

  IF v_archive_typname IS DISTINCT FROM 'staff_team_type' THEN
    RAISE EXCEPTION 'Phase 4A pre-flight FAILED: archive.backup_users.staff_team expected to be typed staff_team_type, found %', COALESCE(v_archive_typname, '<missing>');
  END IF;
END $$;

-- 5. ALTER COLUMN — preserve NULL, no default
ALTER TABLE public.users
  ALTER COLUMN staff_team TYPE text USING staff_team::text;

-- 6. ADD FOREIGN KEY
ALTER TABLE public.users
  ADD CONSTRAINT users_staff_team_fkey
  FOREIGN KEY (staff_team)
  REFERENCES public.dd_staff_team(value)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- 7. RETAIN legacy enum with retention comment
COMMENT ON TYPE public.staff_team_type IS
  'Retained for rollback safety. Also still in use by archive.backup_users.staff_team (historical snapshot from 1 Feb 2026 enum reset). Future archival of this enum requires deciding what to do with archive.backup_users — see EnumToDdInventory.md "Open Decisions".';

-- 8. SAFETY POST-FLIGHT
DO $$
DECLARE
  v_expected_total    bigint := current_setting('phase4a.total_rows')::bigint;
  v_expected_non_null bigint := current_setting('phase4a.non_null_rows')::bigint;
  v_expected_null     bigint := current_setting('phase4a.null_rows')::bigint;
  v_total_rows        bigint;
  v_non_null_rows     bigint;
  v_null_rows         bigint;
  v_invalid_rows      bigint;
  v_data_type         text;
  v_is_nullable       text;
  v_column_default    text;
  v_index_predicate   text;
  v_archive_typname   text;
  v_dd_count          bigint;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE staff_team IS NOT NULL),
         count(*) FILTER (WHERE staff_team IS NULL)
    INTO v_total_rows, v_non_null_rows, v_null_rows
  FROM public.users;

  IF v_total_rows <> v_expected_total THEN
    RAISE EXCEPTION 'Phase 4A post-flight FAILED: users row count changed (was %, now %)', v_expected_total, v_total_rows;
  END IF;
  IF v_non_null_rows <> v_expected_non_null THEN
    RAISE EXCEPTION 'Phase 4A post-flight FAILED: non-NULL staff_team count changed (was %, now %)', v_expected_non_null, v_non_null_rows;
  END IF;
  IF v_null_rows <> v_expected_null THEN
    RAISE EXCEPTION 'Phase 4A post-flight FAILED: NULL staff_team count changed (was %, now %)', v_expected_null, v_null_rows;
  END IF;

  -- No invalid values
  SELECT count(*) INTO v_invalid_rows
  FROM public.users
  WHERE staff_team IS NOT NULL
    AND staff_team NOT IN (SELECT value FROM public.dd_staff_team);
  IF v_invalid_rows > 0 THEN
    RAISE EXCEPTION 'Phase 4A post-flight FAILED: % invalid staff_team values', v_invalid_rows;
  END IF;

  -- Column shape
  SELECT data_type, is_nullable, column_default
    INTO v_data_type, v_is_nullable, v_column_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'staff_team';

  IF v_data_type <> 'text' THEN
    RAISE EXCEPTION 'Phase 4A post-flight FAILED: users.staff_team data_type expected text, got %', v_data_type;
  END IF;
  IF v_is_nullable <> 'YES' THEN
    RAISE EXCEPTION 'Phase 4A post-flight FAILED: users.staff_team is_nullable expected YES, got %', v_is_nullable;
  END IF;
  IF v_column_default IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 4A post-flight FAILED: users.staff_team column_default expected NULL, got %', v_column_default;
  END IF;

  -- Partial index still present with nullability-only predicate
  SELECT pg_get_expr(i.indpred, i.indrelid)
    INTO v_index_predicate
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'idx_users_staff_team';

  IF v_index_predicate IS NULL THEN
    RAISE EXCEPTION 'Phase 4A post-flight FAILED: idx_users_staff_team missing';
  END IF;
  IF v_index_predicate !~* 'staff_team IS NOT NULL' THEN
    RAISE EXCEPTION 'Phase 4A post-flight FAILED: idx_users_staff_team predicate changed: %', v_index_predicate;
  END IF;

  -- archive.backup_users.staff_team untouched
  SELECT t.typname INTO v_archive_typname
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE n.nspname = 'archive'
    AND c.relname = 'backup_users'
    AND a.attname = 'staff_team'
    AND a.attnum  > 0
    AND NOT a.attisdropped;

  IF v_archive_typname IS DISTINCT FROM 'staff_team_type' THEN
    RAISE EXCEPTION 'Phase 4A post-flight FAILED: archive.backup_users.staff_team type changed to %', COALESCE(v_archive_typname, '<missing>');
  END IF;

  -- Lookup table populated
  SELECT count(*) INTO v_dd_count FROM public.dd_staff_team;
  IF v_dd_count <> 6 THEN
    RAISE EXCEPTION 'Phase 4A post-flight FAILED: dd_staff_team expected 6 rows, got %', v_dd_count;
  END IF;
END $$;

-- ROLLBACK:
-- ALTER TABLE public.users
--   DROP CONSTRAINT users_staff_team_fkey;
-- ALTER TABLE public.users
--   ALTER COLUMN staff_team TYPE public.staff_team_type
--     USING staff_team::public.staff_team_type;
-- (No default to restore — column has none.)
-- DROP TABLE public.dd_staff_team;
