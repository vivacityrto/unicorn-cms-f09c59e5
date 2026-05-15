-- Phase 3E: Archive legacy notification-family enums to `archive` schema.
-- All four enums are fully superseded by their dd_ lookup tables (Phases 3A-3D).
-- Per project decision #7 (Carl, 13 May 2026): dead objects move to archive, NOT dropped.

-- ============================================================
-- 1. SAFETY PRE-FLIGHT
-- ============================================================
DO $$
DECLARE
  v_col RECORD;
  v_found boolean := false;
BEGIN
  FOR v_col IN
    SELECT n.nspname AS schema_name, c.relname AS table_name,
           a.attname AS column_name, t.typname AS enum_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE t.typname IN (
      'notification_event_type',
      'notification_status',
      'notification_delivery_target',
      'notification_integration_status'
    )
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND a.attnum > 0
    AND NOT a.attisdropped
  LOOP
    v_found := true;
    RAISE NOTICE 'Pre-flight FAILURE: %.%.% still typed as %',
      v_col.schema_name, v_col.table_name, v_col.column_name, v_col.enum_type;
  END LOOP;

  IF v_found THEN
    RAISE EXCEPTION 'Phase 3E pre-flight failed: one or more columns are still typed as legacy notification enums. Aborting.';
  END IF;
END $$;

-- ============================================================
-- 2. MOVE each legacy enum from public to archive schema
-- ============================================================
ALTER TYPE public.notification_event_type           SET SCHEMA archive;
ALTER TYPE public.notification_status               SET SCHEMA archive;
ALTER TYPE public.notification_delivery_target      SET SCHEMA archive;
ALTER TYPE public.notification_integration_status   SET SCHEMA archive;

-- ============================================================
-- 3. RETENTION COMMENT on each archived enum
-- ============================================================
COMMENT ON TYPE archive.notification_event_type IS
  'Archived 15 May 2026 (Phase 3A cleanup). Superseded by public.dd_notification_event. Kept in archive schema for rollback safety. Permanent DROP requires Carl/Dave sign-off after a documented stable period in production.';

COMMENT ON TYPE archive.notification_status IS
  'Archived 15 May 2026 (Phase 3B cleanup). Superseded by public.dd_notification_status. Kept in archive schema for rollback safety. Permanent DROP requires Carl/Dave sign-off after a documented stable period in production.';

COMMENT ON TYPE archive.notification_delivery_target IS
  'Archived 15 May 2026 (Phase 3C cleanup). Superseded by public.dd_notification_delivery_target. Kept in archive schema for rollback safety. Permanent DROP requires Carl/Dave sign-off after a documented stable period in production.';

COMMENT ON TYPE archive.notification_integration_status IS
  'Archived 15 May 2026 (Phase 3D cleanup). Superseded by public.dd_notification_integration_status. Kept in archive schema for rollback safety. Permanent DROP requires Carl/Dave sign-off after a documented stable period in production.';

-- ============================================================
-- 4. SAFETY POST-FLIGHT
-- ============================================================
DO $$
DECLARE
  v_count    bigint;
  v_archive  bigint;
  v_public   bigint;
  v_col      RECORD;
  v_fk_count bigint;
BEGIN
  -- 4a. All 4 enums must now live in archive
  SELECT count(*) INTO v_archive
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'archive'
    AND t.typname IN (
      'notification_event_type',
      'notification_status',
      'notification_delivery_target',
      'notification_integration_status'
    );

  IF v_archive <> 4 THEN
    RAISE EXCEPTION 'Phase 3E post-flight failed: expected 4 enums in archive, found %', v_archive;
  END IF;

  -- And NONE may remain in public
  SELECT count(*) INTO v_public
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname IN (
      'notification_event_type',
      'notification_status',
      'notification_delivery_target',
      'notification_integration_status'
    );

  IF v_public <> 0 THEN
    RAISE EXCEPTION 'Phase 3E post-flight failed: % legacy enums still in public schema', v_public;
  END IF;

  -- 4b. dd_ replacement tables still exist with expected seed rows
  SELECT count(*) INTO v_count FROM public.dd_notification_event;
  IF v_count < 10 THEN
    RAISE EXCEPTION 'Phase 3E post-flight failed: dd_notification_event has % rows (expected >= 10)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.dd_notification_status;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Phase 3E post-flight failed: dd_notification_status has % rows (expected 4)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.dd_notification_delivery_target;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Phase 3E post-flight failed: dd_notification_delivery_target has % rows (expected 2)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.dd_notification_integration_status;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Phase 3E post-flight failed: dd_notification_integration_status has % rows (expected 3)', v_count;
  END IF;

  -- 4c. dd_-backed columns remain text NOT NULL
  FOR v_col IN
    SELECT c.relname AS table_name, a.attname AS column_name,
           t.typname AS data_type, a.attnotnull AS not_null
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'public'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND (
        (c.relname = 'notification_rules' AND a.attname IN ('event_type', 'delivery_target'))
        OR (c.relname = 'notification_outbox' AND a.attname IN ('event_type', 'status'))
        OR (c.relname = 'notification_audit_log' AND a.attname = 'event_type')
        OR (c.relname = 'user_notification_integrations' AND a.attname = 'status')
      )
  LOOP
    IF v_col.data_type <> 'text' OR v_col.not_null = false THEN
      RAISE EXCEPTION 'Phase 3E post-flight failed: %.% is not text NOT NULL (type=%, notnull=%)',
        v_col.table_name, v_col.column_name, v_col.data_type, v_col.not_null;
    END IF;
  END LOOP;

  -- 4d. FKs to dd_ tables remain intact (expect 6 total per audit)
  SELECT count(*) INTO v_fk_count
  FROM pg_constraint
  WHERE contype = 'f'
    AND confrelid::regclass::text IN (
      'dd_notification_event',
      'dd_notification_status',
      'dd_notification_delivery_target',
      'dd_notification_integration_status'
    );

  IF v_fk_count < 6 THEN
    RAISE EXCEPTION 'Phase 3E post-flight failed: expected at least 6 FKs to dd_ notification tables, found %', v_fk_count;
  END IF;
END $$;

-- ============================================================
-- 5. ROLLBACK (not executed; documentation only)
-- ============================================================
-- ROLLBACK:
-- ALTER TYPE archive.notification_event_type           SET SCHEMA public;
-- ALTER TYPE archive.notification_status               SET SCHEMA public;
-- ALTER TYPE archive.notification_delivery_target      SET SCHEMA public;
-- ALTER TYPE archive.notification_integration_status   SET SCHEMA public;