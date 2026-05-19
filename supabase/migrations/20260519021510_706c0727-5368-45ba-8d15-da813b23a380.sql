-- ============================================================
-- Phase 5B — Migrate eos_function_type & eos_seat_role_type
-- enums to dd_ lookup tables (Unicorn 2.0)
-- ============================================================

-- ------------------------------------------------------------
-- PRE-FLIGHT CHECKS
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.accountability_seats
    WHERE eos_role_type IS NOT NULL
      AND eos_role_type::text NOT IN ('visionary','integrator','leadership_team','functional_lead')
  ) THEN
    RAISE EXCEPTION 'Pre-flight failed: unexpected values in accountability_seats.eos_role_type';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.accountability_functions
    WHERE function_type IS NOT NULL
      AND function_type::text NOT IN ('leadership','operations','finance','delivery','support','sales_marketing')
  ) THEN
    RAISE EXCEPTION 'Pre-flight failed: unexpected values in accountability_functions.function_type';
  END IF;
END $$;

-- ------------------------------------------------------------
-- STEP 1: Create dd_eos_function_type
-- ------------------------------------------------------------
CREATE TABLE public.dd_eos_function_type (
  id          serial       NOT NULL,
  value       text         NOT NULL,
  label       text         NOT NULL,
  sort_order  integer      NOT NULL DEFAULT 0,
  is_active   boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT dd_eos_function_type_pkey PRIMARY KEY (id),
  CONSTRAINT dd_eos_function_type_value_key UNIQUE (value)
);

ALTER TABLE public.dd_eos_function_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON public.dd_eos_function_type
  FOR SELECT USING (true);

INSERT INTO public.dd_eos_function_type (value, label, sort_order) VALUES
  ('leadership',      'Leadership',        1),
  ('operations',      'Operations',        2),
  ('finance',         'Finance',           3),
  ('delivery',        'Delivery',          4),
  ('support',         'Support',           5),
  ('sales_marketing', 'Sales & Marketing', 6);

-- ------------------------------------------------------------
-- STEP 2: Create dd_eos_seat_role_type
-- ------------------------------------------------------------
CREATE TABLE public.dd_eos_seat_role_type (
  id          serial       NOT NULL,
  value       text         NOT NULL,
  label       text         NOT NULL,
  sort_order  integer      NOT NULL DEFAULT 0,
  is_active   boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT dd_eos_seat_role_type_pkey PRIMARY KEY (id),
  CONSTRAINT dd_eos_seat_role_type_value_key UNIQUE (value)
);

ALTER TABLE public.dd_eos_seat_role_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON public.dd_eos_seat_role_type
  FOR SELECT USING (true);

INSERT INTO public.dd_eos_seat_role_type (value, label, sort_order) VALUES
  ('visionary',       'Visionary',       1),
  ('integrator',      'Integrator',      2),
  ('leadership_team', 'Leadership Team', 3),
  ('functional_lead', 'Functional Lead', 4);

-- ------------------------------------------------------------
-- STEP 3: Drop dependent view (depends on enum type)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.seat_linked_data;

-- ------------------------------------------------------------
-- STEP 4: Convert accountability_functions.function_type
-- ------------------------------------------------------------
ALTER TABLE public.accountability_functions
  ALTER COLUMN function_type TYPE text USING function_type::text;

ALTER TABLE public.accountability_functions
  ADD CONSTRAINT accountability_functions_function_type_fkey
  FOREIGN KEY (function_type)
  REFERENCES public.dd_eos_function_type(value)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- STEP 5: Convert accountability_seats.eos_role_type
-- ------------------------------------------------------------
ALTER TABLE public.accountability_seats
  ALTER COLUMN eos_role_type TYPE text USING eos_role_type::text;

ALTER TABLE public.accountability_seats
  ADD CONSTRAINT accountability_seats_eos_role_type_fkey
  FOREIGN KEY (eos_role_type)
  REFERENCES public.dd_eos_seat_role_type(value)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- STEP 6: Recreate seat_linked_data (byte-identical definition;
--          eos_role_type column is now text instead of enum).
--          The 'closed'::meeting_status cast is preserved — out of
--          scope for this migration.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.seat_linked_data AS
SELECT
  s.id AS seat_id,
  s.tenant_id,
  s.seat_name,
  s.eos_role_type,
  sa.user_id AS primary_owner_id,
  ( SELECT count(*) AS count
    FROM eos_rocks r
    WHERE r.owner_id = sa.user_id
      AND r.tenant_id = s.tenant_id
      AND r.status <> 'complete'::text
  ) AS active_rocks_count,
  ( SELECT count(*) AS count
    FROM eos_meeting_attendees ma
    JOIN eos_meetings m ON m.id = ma.meeting_id
    WHERE ma.user_id = sa.user_id
      AND m.tenant_id = s.tenant_id
      AND ma.attendance_status = 'attended'::text
      AND m.status = 'closed'::meeting_status
  ) AS meetings_attended_count,
  ( SELECT count(*) AS count
    FROM eos_meeting_attendees ma
    JOIN eos_meetings m ON m.id = ma.meeting_id
    WHERE ma.user_id = sa.user_id
      AND m.tenant_id = s.tenant_id
      AND ma.attendance_status = 'no_show'::text
      AND m.status = 'closed'::meeting_status
  ) AS meetings_missed_count
FROM accountability_seats s
LEFT JOIN accountability_seat_assignments sa
  ON sa.seat_id = s.id
  AND sa.assignment_type = 'Primary'::text
  AND sa.end_date IS NULL;

-- ------------------------------------------------------------
-- STEP 7: Retention comments on legacy enums (do not drop)
-- ------------------------------------------------------------
COMMENT ON TYPE public.eos_function_type IS
  'Legacy enum retained for rollback safety. Superseded by dd_eos_function_type (Phase 5B, 19 May 2026). Do not drop until dd_eos_function_type has been stable in production for a documented period. Permanent DROP requires Carl/Dave sign-off.';

COMMENT ON TYPE public.eos_seat_role_type IS
  'Legacy enum retained for rollback safety. Superseded by dd_eos_seat_role_type (Phase 5B, 19 May 2026). Do not drop until dd_eos_seat_role_type has been stable in production for a documented period. Permanent DROP requires Carl/Dave sign-off.';

-- ------------------------------------------------------------
-- POST-FLIGHT CHECKS
-- ------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.dd_eos_function_type) <> 6 THEN
    RAISE EXCEPTION 'Post-flight failed: dd_eos_function_type does not have 6 rows';
  END IF;

  IF (SELECT COUNT(*) FROM public.dd_eos_seat_role_type) <> 4 THEN
    RAISE EXCEPTION 'Post-flight failed: dd_eos_seat_role_type does not have 4 rows';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.accountability_seats
    WHERE eos_role_type IS NOT NULL
      AND eos_role_type NOT IN (SELECT value FROM public.dd_eos_seat_role_type)
  ) THEN
    RAISE EXCEPTION 'Post-flight failed: invalid eos_role_type values in accountability_seats';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.accountability_functions
    WHERE function_type IS NOT NULL
      AND function_type NOT IN (SELECT value FROM public.dd_eos_function_type)
  ) THEN
    RAISE EXCEPTION 'Post-flight failed: invalid function_type values in accountability_functions';
  END IF;

  IF (SELECT COUNT(*) FROM public.accountability_seats) <> 7 THEN
    RAISE EXCEPTION 'Post-flight failed: accountability_seats row count changed';
  END IF;

  IF (SELECT COUNT(*) FROM public.accountability_functions) <> 7 THEN
    RAISE EXCEPTION 'Post-flight failed: accountability_functions row count changed';
  END IF;

  IF (SELECT COUNT(*) FROM pg_constraint
      WHERE conname IN (
        'accountability_functions_function_type_fkey',
        'accountability_seats_eos_role_type_fkey'
      )) <> 2 THEN
    RAISE EXCEPTION 'Post-flight failed: FK constraints not found';
  END IF;

  IF (SELECT COUNT(*) FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname IN ('eos_function_type', 'eos_seat_role_type')) <> 2 THEN
    RAISE EXCEPTION 'Post-flight failed: legacy enums missing from public schema';
  END IF;

  PERFORM 1 FROM public.seat_linked_data LIMIT 1;
END $$;

-- ============================================================
-- ROLLBACK SQL (reference only — do not execute)
-- ============================================================
-- DROP VIEW IF EXISTS public.seat_linked_data;
-- ALTER TABLE public.accountability_functions DROP CONSTRAINT IF EXISTS accountability_functions_function_type_fkey;
-- ALTER TABLE public.accountability_seats DROP CONSTRAINT IF EXISTS accountability_seats_eos_role_type_fkey;
-- ALTER TABLE public.accountability_functions
--   ALTER COLUMN function_type TYPE public.eos_function_type
--   USING function_type::public.eos_function_type;
-- ALTER TABLE public.accountability_seats
--   ALTER COLUMN eos_role_type TYPE public.eos_seat_role_type
--   USING eos_role_type::public.eos_seat_role_type;
-- [Recreate seat_linked_data using the prior enum-typed definition]
-- DROP TABLE IF EXISTS public.dd_eos_seat_role_type;
-- DROP TABLE IF EXISTS public.dd_eos_function_type;
