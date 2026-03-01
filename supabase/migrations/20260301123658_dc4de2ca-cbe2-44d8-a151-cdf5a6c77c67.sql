
-- Drop RLS policies on legacy tables before dropping them

-- client_fields
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'client_fields' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.client_fields', pol.policyname);
  END LOOP;
END$$;

-- clientfields
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'clientfields' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clientfields', pol.policyname);
  END LOOP;
END$$;

-- documents_fields
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'documents_fields' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.documents_fields', pol.policyname);
  END LOOP;
END$$;

-- merge_field_definitions
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'merge_field_definitions' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.merge_field_definitions', pol.policyname);
  END LOOP;
END$$;

-- Drop the four legacy tables
DROP TABLE IF EXISTS public.client_fields;
DROP TABLE IF EXISTS public.clientfields;
DROP TABLE IF EXISTS public.documents_fields;
DROP TABLE IF EXISTS public.merge_field_definitions;
