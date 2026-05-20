-- ============================================================
-- Phase 5Z: Archive legacy Phase 5 enum types
-- Analogous to Phase 3E (notification enums) and Phase 4D-6 (unicorn_role)
-- All 8 enums have zero active column, function, trigger, view, or policy dependencies.
-- eos_issue_status was already archived in Phase 5C — not touched here.
-- ============================================================

-- PRE-FLIGHT: assert zero columns in any schema still typed as these enums
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE udt_name IN (
    'eos_todo_status','eos_function_type','eos_seat_role_type',
    'eos_participant_role','eos_meeting_type',
    'meeting_status','meeting_role','eos_meeting_role'
  );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Phase 5Z pre-flight failed: % column(s) still typed as a target enum. Aborting.', v_count;
  END IF;
END $$;

-- ARCHIVE: move all 8 legacy enum types from public to archive schema
ALTER TYPE public.eos_todo_status      SET SCHEMA archive;
ALTER TYPE public.eos_function_type    SET SCHEMA archive;
ALTER TYPE public.eos_seat_role_type   SET SCHEMA archive;
ALTER TYPE public.eos_participant_role SET SCHEMA archive;
ALTER TYPE public.eos_meeting_type     SET SCHEMA archive;
ALTER TYPE public.meeting_status       SET SCHEMA archive;
ALTER TYPE public.meeting_role         SET SCHEMA archive;
ALTER TYPE public.eos_meeting_role     SET SCHEMA archive;

-- RETENTION COMMENTS
COMMENT ON TYPE archive.eos_todo_status IS
  'Archived Phase 5Z. Superseded by dd_eos_todo_status. Permanent DROP requires Carl/Dave sign-off after documented stable period in production.';
COMMENT ON TYPE archive.eos_function_type IS
  'Archived Phase 5Z. Superseded by dd_eos_function_type. Permanent DROP requires Carl/Dave sign-off after documented stable period in production.';
COMMENT ON TYPE archive.eos_seat_role_type IS
  'Archived Phase 5Z. Superseded by dd_eos_seat_role_type. Permanent DROP requires Carl/Dave sign-off after documented stable period in production.';
COMMENT ON TYPE archive.eos_participant_role IS
  'Archived Phase 5Z. Superseded by dd_eos_participant_role. Permanent DROP requires Carl/Dave sign-off after documented stable period in production.';
COMMENT ON TYPE archive.eos_meeting_type IS
  'Archived Phase 5Z. Superseded by dd_eos_meeting_type. Permanent DROP requires Carl/Dave sign-off after documented stable period in production.';
COMMENT ON TYPE archive.meeting_status IS
  'Archived Phase 5Z. Superseded by dd_meeting_status. Permanent DROP requires Carl/Dave sign-off after documented stable period in production.';
COMMENT ON TYPE archive.meeting_role IS
  'Archived Phase 5Z. Superseded by dd_meeting_role. Permanent DROP requires Carl/Dave sign-off after documented stable period in production.';
COMMENT ON TYPE archive.eos_meeting_role IS
  'Archived Phase 5Z. No dd_ superseder — was never attached to any column. Permanent DROP requires Carl/Dave sign-off after documented stable period in production.';

-- POST-FLIGHT
DO $$
DECLARE
  v_in_archive integer;
  v_in_public  integer;
  v_col_count  integer;
  v_issue_status_schema text;
BEGIN
  SELECT COUNT(*) INTO v_in_archive
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'archive'
  AND t.typname IN (
    'eos_todo_status','eos_function_type','eos_seat_role_type',
    'eos_participant_role','eos_meeting_type',
    'meeting_status','meeting_role','eos_meeting_role'
  );
  IF v_in_archive != 8 THEN
    RAISE EXCEPTION 'Phase 5Z post-flight failed: expected 8 enums in archive, found %.', v_in_archive;
  END IF;

  SELECT COUNT(*) INTO v_in_public
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
  AND t.typname IN (
    'eos_todo_status','eos_function_type','eos_seat_role_type',
    'eos_participant_role','eos_meeting_type',
    'meeting_status','meeting_role','eos_meeting_role'
  );
  IF v_in_public != 0 THEN
    RAISE EXCEPTION 'Phase 5Z post-flight failed: % enum(s) still in public schema.', v_in_public;
  END IF;

  SELECT COUNT(*) INTO v_col_count
  FROM information_schema.columns
  WHERE udt_name IN (
    'eos_todo_status','eos_function_type','eos_seat_role_type',
    'eos_participant_role','eos_meeting_type',
    'meeting_status','meeting_role','eos_meeting_role'
  );
  IF v_col_count != 0 THEN
    RAISE EXCEPTION 'Phase 5Z post-flight failed: % column(s) still typed as a target enum.', v_col_count;
  END IF;

  SELECT n.nspname INTO v_issue_status_schema
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE t.typname = 'eos_issue_status';
  IF v_issue_status_schema IS DISTINCT FROM 'archive' THEN
    RAISE EXCEPTION 'Phase 5Z post-flight failed: eos_issue_status is in % schema, expected archive.', v_issue_status_schema;
  END IF;

  RAISE NOTICE 'Phase 5Z post-flight passed: 8 enums archived, 0 in public, 0 columns affected, eos_issue_status untouched.';
END $$;

-- ROLLBACK (run manually if needed):
-- ALTER TYPE archive.eos_todo_status      SET SCHEMA public;
-- ALTER TYPE archive.eos_function_type    SET SCHEMA public;
-- ALTER TYPE archive.eos_seat_role_type   SET SCHEMA public;
-- ALTER TYPE archive.eos_participant_role SET SCHEMA public;
-- ALTER TYPE archive.eos_meeting_type     SET SCHEMA public;
-- ALTER TYPE archive.meeting_status       SET SCHEMA public;
-- ALTER TYPE archive.meeting_role         SET SCHEMA public;
-- ALTER TYPE archive.eos_meeting_role     SET SCHEMA public;