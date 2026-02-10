
-- 1. Drop old check constraint and add trainingPackage
ALTER TABLE public.tenant_rto_scope DROP CONSTRAINT tenant_rto_scope_scope_type_check;
ALTER TABLE public.tenant_rto_scope ADD CONSTRAINT tenant_rto_scope_scope_type_check 
  CHECK (scope_type = ANY (ARRAY['qualification', 'unit', 'skillset', 'accreditedCourse', 'trainingPackage']));

-- 2. Update persist function to accept trainingPackage
CREATE OR REPLACE FUNCTION public.persist_tga_scope_items(p_tenant_id integer, p_scope_type text, p_scope_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted_count INT := 0;
  _item JSONB;
BEGIN
  IF p_scope_type NOT IN ('qualification', 'unit', 'skillset', 'accreditedCourse', 'trainingPackage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid scope_type');
  END IF;
  
  FOR _item IN SELECT * FROM jsonb_array_elements(p_scope_items)
  LOOP
    INSERT INTO public.tenant_rto_scope (
      id, tenant_id, code, title, scope_type, status, is_superseded, superseded_by, tga_data, last_refreshed_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      p_tenant_id,
      COALESCE(_item->>'code', _item->>'Code', ''),
      COALESCE(_item->>'title', _item->>'Title', _item->>'name', ''),
      p_scope_type,
      COALESCE(_item->>'statusLabel', _item->>'status', 'current'),
      COALESCE((_item->>'isSuperseded')::boolean, false),
      _item->>'supersededBy',
      _item,
      NOW(),
      NOW()
    )
    ON CONFLICT (tenant_id, code, scope_type) 
    DO UPDATE SET
      title = EXCLUDED.title,
      status = EXCLUDED.status,
      is_superseded = EXCLUDED.is_superseded,
      superseded_by = EXCLUDED.superseded_by,
      tga_data = EXCLUDED.tga_data,
      last_refreshed_at = NOW(),
      updated_at = NOW();
    
    _inserted_count := _inserted_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object('success', true, 'items_persisted', _inserted_count);
END;
$$;

-- 3. Update get_tenant_scope_items if it exists, to include trainingPackage
CREATE OR REPLACE FUNCTION public.get_tenant_scope_items(p_tenant_id integer, p_scope_type text DEFAULT NULL)
RETURNS SETOF tenant_rto_scope
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM tenant_rto_scope
  WHERE tenant_id = p_tenant_id
    AND (p_scope_type IS NULL OR scope_type = p_scope_type)
  ORDER BY code;
$$;
