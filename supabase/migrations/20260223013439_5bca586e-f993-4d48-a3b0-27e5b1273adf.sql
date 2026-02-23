
DROP FUNCTION IF EXISTS public.list_code_tables();

CREATE OR REPLACE FUNCTION public.list_code_tables()
RETURNS TABLE(
  table_name text,
  schema_name text,
  row_count bigint,
  has_rls boolean,
  policy_count integer,
  columns jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
BEGIN
  SELECT role INTO v_user_role FROM public.users WHERE user_uuid = auth.uid();
  IF v_user_role IS DISTINCT FROM 'Super Admin' THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  RETURN QUERY
  SELECT
    t.table_name::text,
    t.table_schema::text AS schema_name,
    COALESCE(
      (SELECT CASE 
        WHEN c2.reltuples < 0 THEN 0
        ELSE c2.reltuples::bigint
       END
       FROM pg_catalog.pg_class c2 
       JOIN pg_catalog.pg_namespace n ON n.oid = c2.relnamespace
       WHERE c2.relname = t.table_name AND n.nspname = 'public'), 
      0
    ) AS row_count,
    COALESCE(c.relrowsecurity, false) AS has_rls,
    COALESCE(
      (SELECT count(*)::int FROM pg_catalog.pg_policies p WHERE p.tablename = t.table_name AND p.schemaname = 'public'),
      0
    ) AS policy_count,
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
    ) AS columns
  FROM information_schema.tables t
  LEFT JOIN pg_catalog.pg_class c ON c.relname = t.table_name
  LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name LIKE 'dd_%'
  ORDER BY t.table_name;
END;
$$;
