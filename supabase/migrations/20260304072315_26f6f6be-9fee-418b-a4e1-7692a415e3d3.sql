CREATE OR REPLACE FUNCTION public.add_app_setting(
  p_column_name text,
  p_data_type text,
  p_default_value text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sql text;
  v_type text;
  v_default text := '';
BEGIN
  -- Gate: only super admins
  IF NOT public.is_super_admin_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  -- Validate column name format
  IF p_column_name !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid column name: must be lowercase snake_case';
  END IF;

  -- Check column doesn't already exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_settings'
      AND column_name = p_column_name
  ) THEN
    RAISE EXCEPTION 'Column % already exists in app_settings', p_column_name;
  END IF;

  -- Map data type
  CASE p_data_type
    WHEN 'boolean' THEN v_type := 'boolean';
    WHEN 'text' THEN v_type := 'text';
    WHEN 'integer' THEN v_type := 'integer';
    ELSE RAISE EXCEPTION 'Unsupported data type: %. Use boolean, text, or integer', p_data_type;
  END CASE;

  -- Build default clause
  IF p_default_value IS NOT NULL AND p_default_value != '' THEN
    IF p_data_type = 'boolean' THEN
      v_default := ' DEFAULT ' || p_default_value::boolean::text;
    ELSIF p_data_type = 'integer' THEN
      v_default := ' DEFAULT ' || p_default_value::integer::text;
    ELSE
      v_default := format(' DEFAULT %L', p_default_value);
    END IF;
  ELSE
    -- Sensible defaults
    IF p_data_type = 'boolean' THEN v_default := ' DEFAULT false';
    ELSIF p_data_type = 'integer' THEN v_default := ' DEFAULT 0';
    END IF;
  END IF;

  v_sql := format('ALTER TABLE public.app_settings ADD COLUMN %I %s NOT NULL%s', p_column_name, v_type, v_default);
  
  -- For text columns, allow null
  IF p_data_type = 'text' THEN
    v_sql := format('ALTER TABLE public.app_settings ADD COLUMN %I %s%s', p_column_name, v_type, v_default);
  END IF;

  EXECUTE v_sql;
END;
$$;