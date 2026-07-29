-- list_code_tables (backs /admin/code-tables) has been 400ing for most real
-- Super Admins. It gated access on the legacy public.users.role column
-- instead of unicorn_role -- role is stale/unmaintained data (e.g. Carl's
-- own row has role='Client Child' while unicorn_role='Super Admin', same
-- for several other current Super Admins). Every other SuperAdmin-gated
-- RPC in this codebase (get_user_audit, admin_fix_user_linkage,
-- admin_set_role_type, etc.) checks public.is_super_admin(), which reads
-- unicorn_role correctly -- this function just never got aligned to that
-- shared helper.

CREATE OR REPLACE FUNCTION public.list_code_tables()
 RETURNS TABLE(table_name text, schema_name text, row_count bigint, has_rls boolean, policy_count integer, columns jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  v_count bigint;
BEGIN
  IF NOT public.is_super_admin() THEN
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
      AND (t.table_name LIKE 'dd_%' OR t.table_name = 'app_settings')
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
$function$;
