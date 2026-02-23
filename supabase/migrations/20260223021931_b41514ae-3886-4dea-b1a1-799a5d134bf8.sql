
CREATE OR REPLACE FUNCTION public.list_code_tables()
RETURNS TABLE (
  table_name text,
  schema_name text,
  row_count bigint,
  has_rls boolean,
  policy_count int,
  columns jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
  rec record;
  v_count bigint;
BEGIN
  SELECT role INTO v_user_role FROM public.users WHERE user_uuid = auth.uid();
  IF v_user_role IS DISTINCT FROM 'Super Admin' THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  FOR rec IN
    SELECT
      t.table_name::text AS tname,
      t.table_schema::text AS sname,
      COALESCE(c.relrowsecurity, false) AS rls,
      COALESCE(
        (SELECT count(*)::int FROM pg_catalog.pg_policies p WHERE p.tablename = t.table_name AND p.schemaname = 'public'),
        0
      ) AS pcnt,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'column_name', cols.column_name,
          'data_type', cols.data_type,
          'is_nullable', cols.is_nullable,
          'column_default', cols.column_default
        ) ORDER BY cols.ordinal_position)
        FROM information_schema.columns cols
        WHERE cols.table_name = t.table_name AND cols.table_schema = 'public'),
        '[]'::jsonb
      ) AS cols
    FROM information_schema.tables t
    LEFT JOIN pg_catalog.pg_class c ON c.relname = t.table_name
    LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND t.table_name LIKE 'dd_%'
    ORDER BY t.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', rec.tname) INTO v_count;
    table_name := rec.tname;
    schema_name := rec.sname;
    row_count := v_count;
    has_rls := rec.rls;
    policy_count := rec.pcnt;
    columns := rec.cols;
    RETURN NEXT;
  END LOOP;
END;
$$;
