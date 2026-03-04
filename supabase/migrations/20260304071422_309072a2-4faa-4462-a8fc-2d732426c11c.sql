CREATE OR REPLACE FUNCTION public.code_table_operation(
  p_table_name text,
  p_operation text,
  p_data jsonb DEFAULT NULL,
  p_where_clause jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Validate table name matches dd_% pattern OR is app_settings, and exists
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND information_schema.tables.table_name = p_table_name
      AND (information_schema.tables.table_name LIKE 'dd\_%' OR information_schema.tables.table_name = 'app_settings')
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'Invalid table: % — must be a dd_ prefixed table or app_settings in public schema', p_table_name;
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
      
      v_set_parts := ARRAY[]::text[];
      FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_data) LOOP
        v_set_parts := array_append(v_set_parts, format('%I = %L', v_key, v_value));
      END LOOP;
      
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
      
      v_where_parts := ARRAY[]::text[];
      FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_where_clause) LOOP
        v_where_parts := array_append(v_where_parts, format('%I = %L', v_key, v_value));
      END LOOP;
      
      IF v_has_is_active THEN
        v_sql := format(
          'UPDATE public.%I SET is_active = false WHERE %s RETURNING row_to_json(public.%I.*)::jsonb',
          p_table_name,
          array_to_string(v_where_parts, ' AND '),
          p_table_name
        );
      ELSE
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