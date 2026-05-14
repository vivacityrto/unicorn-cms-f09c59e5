DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE udt_name = 'vivacity_role' AND table_schema = 'public'
  ) THEN
    RAISE EXCEPTION 'vivacity_role is still in use by a table column — migration aborted.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = 'vivacity_role'
  ) THEN
    RAISE EXCEPTION 'vivacity_role not found in public schema — already moved or does not exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'archive'
  ) THEN
    RAISE EXCEPTION 'archive schema does not exist — migration aborted.';
  END IF;
END $$;

ALTER TYPE public.vivacity_role SET SCHEMA archive;