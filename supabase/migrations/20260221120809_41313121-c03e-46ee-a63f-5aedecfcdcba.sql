
-- =============================================================================
-- Code Tables Manager RPCs
-- =============================================================================

-- 1. format_code_label: Capitalises words, replaces "and" with "&"
CREATE OR REPLACE FUNCTION public.format_code_label(input_label text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  result text;
  word text;
  words text[];
BEGIN
  IF input_label IS NULL OR trim(input_label) = '' THEN
    RETURN input_label;
  END IF;
  
  -- Normalize whitespace
  result := trim(regexp_replace(input_label, '\s+', ' ', 'g'));
  
  -- Split into words and capitalize each
  words := string_to_array(result, ' ');
  result := '';
  FOREACH word IN ARRAY words LOOP
    IF lower(word) = 'and' THEN
      result := result || '& ';
    ELSE
      result := result || upper(left(word, 1)) || lower(substring(word from 2)) || ' ';
    END IF;
  END LOOP;
  
  RETURN trim(result);
END;
$$;

-- 2. standardize_code_value: Generates snake_case slug from label
CREATE OR REPLACE FUNCTION public.standardize_code_value(input_label text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  result text;
BEGIN
  IF input_label IS NULL OR trim(input_label) = '' THEN
    RETURN input_label;
  END IF;
  
  result := lower(trim(input_label));
  -- Replace & with and
  result := replace(result, '&', 'and');
  -- Replace spaces and hyphens with underscores
  result := regexp_replace(result, '[\s\-]+', '_', 'g');
  -- Strip non-alphanumeric except underscores
  result := regexp_replace(result, '[^a-z0-9_]', '', 'g');
  -- Collapse multiple underscores
  result := regexp_replace(result, '_+', '_', 'g');
  -- Trim leading/trailing underscores
  result := trim(both '_' from result);
  
  RETURN result;
END;
$$;

-- 3. list_code_tables: Discovery RPC for dd_ tables
CREATE OR REPLACE FUNCTION public.list_code_tables()
RETURNS TABLE(
  table_name text,
  schema_name text,
  row_count bigint,
  has_rls boolean,
  policy_count integer,
  columns jsonb,
  last_updated timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Gate: only super admins
  IF NOT public.is_super_admin_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  RETURN QUERY
  SELECT
    t.table_name::text,
    t.table_schema::text AS schema_name,
    COALESCE(
      (SELECT c2.reltuples::bigint FROM pg_catalog.pg_class c2 
       JOIN pg_catalog.pg_namespace n ON n.oid = c2.relnamespace
       WHERE c2.relname = t.table_name AND n.nspname = 'public'), 
      0
    ) AS row_count,
    COALESCE(c.relrowsecurity, false) AS has_rls,
    COALESCE(
      (SELECT count(*)::integer FROM pg_catalog.pg_policies p 
       WHERE p.tablename = t.table_name AND p.schemaname = t.table_schema), 
      0
    ) AS policy_count,
    (SELECT jsonb_agg(jsonb_build_object(
       'column_name', cols.column_name,
       'data_type', cols.data_type,
       'is_nullable', cols.is_nullable,
       'column_default', cols.column_default
     ) ORDER BY cols.ordinal_position)
     FROM information_schema.columns cols
     WHERE cols.table_name = t.table_name AND cols.table_schema = t.table_schema
    ) AS columns,
    now() AS last_updated
  FROM information_schema.tables t
  LEFT JOIN pg_catalog.pg_class c ON c.relname = t.table_name
    AND c.relnamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = 'public')
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name LIKE 'dd\_%'
  ORDER BY t.table_name;
END;
$$;

-- 4. code_table_operation: Generic CRUD RPC for dd_ tables
CREATE OR REPLACE FUNCTION public.code_table_operation(
  p_table_name text,
  p_operation text,
  p_data jsonb DEFAULT NULL,
  p_where_clause jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sql text;
  v_result jsonb;
  v_table_exists boolean;
  v_has_is_active boolean;
  v_key text;
  v_value text;
  v_set_parts text[];
  v_where_parts text[];
  v_columns text[];
  v_values text[];
  v_first boolean;
BEGIN
  -- Gate: only super admins
  IF NOT public.is_super_admin_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  -- Validate table name matches dd_% pattern and exists
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND information_schema.tables.table_name = p_table_name
      AND information_schema.tables.table_name LIKE 'dd\_%'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'Invalid table: % — must be a dd_ prefixed table in public schema', p_table_name;
  END IF;

  -- Check if table has is_active column (for soft delete)
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE information_schema.columns.table_schema = 'public'
      AND information_schema.columns.table_name = p_table_name
      AND information_schema.columns.column_name = 'is_active'
  ) INTO v_has_is_active;

  -- Execute operation
  CASE p_operation
    WHEN 'select' THEN
      v_sql := format('SELECT jsonb_agg(row_to_json(t)::jsonb) FROM public.%I t', p_table_name);
      
      -- Add WHERE clause if provided
      IF p_where_clause IS NOT NULL AND p_where_clause != '{}'::jsonb THEN
        v_where_parts := ARRAY[]::text[];
        FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_where_clause) LOOP
          v_where_parts := array_append(v_where_parts, format('%I = %L', v_key, v_value));
        END LOOP;
        v_sql := v_sql || ' WHERE ' || array_to_string(v_where_parts, ' AND ');
      END IF;
      
      EXECUTE v_sql INTO v_result;
      RETURN COALESCE(v_result, '[]'::jsonb);

    WHEN 'insert' THEN
      IF p_data IS NULL THEN
        RAISE EXCEPTION 'Data required for insert operation';
      END IF;
      
      v_columns := ARRAY[]::text[];
      v_values := ARRAY[]::text[];
      FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_data) LOOP
        v_columns := array_append(v_columns, format('%I', v_key));
        v_values := array_append(v_values, format('%L', v_value));
      END LOOP;
      
      v_sql := format(
        'INSERT INTO public.%I (%s) VALUES (%s) RETURNING row_to_json(public.%I.*)::jsonb',
        p_table_name,
        array_to_string(v_columns, ', '),
        array_to_string(v_values, ', '),
        p_table_name
      );
      
      EXECUTE v_sql INTO v_result;
      RETURN v_result;

    WHEN 'update' THEN
      IF p_data IS NULL THEN
        RAISE EXCEPTION 'Data required for update operation';
      END IF;
      IF p_where_clause IS NULL THEN
        RAISE EXCEPTION 'Where clause required for update operation';
      END IF;
      
      -- Build SET clause
      v_set_parts := ARRAY[]::text[];
      FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_data) LOOP
        v_set_parts := array_append(v_set_parts, format('%I = %L', v_key, v_value));
      END LOOP;
      
      -- Build WHERE clause
      v_where_parts := ARRAY[]::text[];
      FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_where_clause) LOOP
        v_where_parts := array_append(v_where_parts, format('%I = %L', v_key, v_value));
      END LOOP;
      
      v_sql := format(
        'UPDATE public.%I SET %s WHERE %s RETURNING row_to_json(public.%I.*)::jsonb',
        p_table_name,
        array_to_string(v_set_parts, ', '),
        array_to_string(v_where_parts, ' AND '),
        p_table_name
      );
      
      EXECUTE v_sql INTO v_result;
      RETURN v_result;

    WHEN 'delete' THEN
      IF p_where_clause IS NULL THEN
        RAISE EXCEPTION 'Where clause required for delete operation';
      END IF;
      
      -- Build WHERE clause
      v_where_parts := ARRAY[]::text[];
      FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_where_clause) LOOP
        v_where_parts := array_append(v_where_parts, format('%I = %L', v_key, v_value));
      END LOOP;
      
      IF v_has_is_active THEN
        -- Soft delete
        v_sql := format(
          'UPDATE public.%I SET is_active = false WHERE %s RETURNING row_to_json(public.%I.*)::jsonb',
          p_table_name,
          array_to_string(v_where_parts, ' AND '),
          p_table_name
        );
      ELSE
        -- Hard delete
        v_sql := format(
          'DELETE FROM public.%I WHERE %s RETURNING row_to_json(public.%I.*)::jsonb',
          p_table_name,
          array_to_string(v_where_parts, ' AND '),
          p_table_name
        );
      END IF;
      
      EXECUTE v_sql INTO v_result;
      RETURN v_result;

    ELSE
      RAISE EXCEPTION 'Invalid operation: %. Must be select, insert, update, or delete', p_operation;
  END CASE;
END;
$$;
