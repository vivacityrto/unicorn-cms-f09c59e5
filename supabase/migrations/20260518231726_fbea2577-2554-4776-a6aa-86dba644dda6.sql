-- Phase 4D-6: Archive public.unicorn_role enum to archive schema

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE udt_name = 'unicorn_role'
    AND table_schema = 'public';
  IF v_count > 0 THEN
    RAISE EXCEPTION '4D-6 pre-flight failed: % public column(s) still typed as unicorn_role enum', v_count;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'unicorn_role' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION '4D-6 pre-flight failed: public.unicorn_role not found — already moved or dropped?';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'archive'
      AND table_name = 'backup_users'
      AND column_name = 'unicorn_role'
      AND udt_name = 'unicorn_role'
  ) THEN
    RAISE EXCEPTION '4D-6 pre-flight failed: archive.backup_users.unicorn_role not found with expected enum type';
  END IF;
END $$;

ALTER TYPE public.unicorn_role SET SCHEMA archive;

COMMENT ON TYPE archive.unicorn_role IS
  'ARCHIVED (4D-6, 19 May 2026): Legacy unicorn_role enum. Superseded by dd_unicorn_roles. '
  'users.unicorn_role is text with FK to dd_unicorn_roles(value) since 4D-2+4D-3 (18 May 2026). '
  'Retained in archive schema because archive.backup_users.unicorn_role is still typed as this enum '
  '(snapshot of users table from 1 Feb 2026). '
  'DO NOT DROP without first converting archive.backup_users.unicorn_role to text or dropping that table. '
  'Requires Carl + Dave sign-off before permanent DROP.';

-- Rollback (separate migration if needed):
-- ALTER TYPE archive.unicorn_role SET SCHEMA public;