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
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT public.is_vivacity_team_safe((SELECT auth.uid())) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: staff only');
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.persist_tga_scope_items(integer, text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_tga_scope_items(integer, text, jsonb) TO authenticated, service_role;