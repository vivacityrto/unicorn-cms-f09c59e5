-- ============================================================================
-- TGA INTEGRATION - RPC Functions for new data model
-- ============================================================================

-- Drop and recreate tga_trigger_sync to work with new schema
DROP FUNCTION IF EXISTS public.tga_trigger_sync(bigint);

-- Function to link a client to an RTO and sync from local data
CREATE OR REPLACE FUNCTION public.tga_sync_client(
  p_client_id uuid,
  p_rto_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rto text;
  v_link_id uuid;
  v_import_id uuid;
  v_rto_data record;
  v_scope_counts record;
BEGIN
  -- Get RTO number from client if not provided
  IF p_rto_number IS NULL THEN
    SELECT rtoid INTO v_rto
    FROM public.clients_legacy
    WHERE id = p_client_id;
  ELSE
    v_rto := p_rto_number;
  END IF;

  IF v_rto IS NULL OR v_rto = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No RTO number found for client'
    );
  END IF;

  -- Validate RTO format (4-6 digits)
  IF NOT (v_rto ~ '^\d{4,6}$') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid RTO number format',
      'rto_number', v_rto
    );
  END IF;

  -- Get latest successful import
  SELECT latest_success_import_id INTO v_import_id
  FROM public.tga_import_state
  WHERE id = 1;

  -- Check if RTO exists in our data
  SELECT * INTO v_rto_data
  FROM public.tga_rtos
  WHERE rto_number = v_rto;

  IF v_rto_data IS NULL THEN
    -- RTO not found in local data - mark as not_found
    INSERT INTO public.tga_links (client_id, rto_number, is_linked, link_status, last_sync_status, last_sync_error)
    VALUES (p_client_id, v_rto, false, 'not_found', 'failed', 'RTO not found in dataset')
    ON CONFLICT (client_id) DO UPDATE SET
      rto_number = EXCLUDED.rto_number,
      is_linked = false,
      link_status = 'not_found',
      last_sync_status = 'failed',
      last_sync_error = 'RTO not found in dataset',
      updated_at = now()
    RETURNING id INTO v_link_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'RTO not found in dataset. Run a dataset import first.',
      'rto_number', v_rto,
      'link_id', v_link_id
    );
  END IF;

  -- Count scope items for this RTO
  SELECT 
    COUNT(*) FILTER (WHERE type = 'qualification') AS quals,
    COUNT(*) FILTER (WHERE type = 'unit') AS units,
    COUNT(*) FILTER (WHERE type = 'skill_set') AS skill_sets,
    COUNT(*) AS total
  INTO v_scope_counts
  FROM public.tga_scope_items
  WHERE rto_number = v_rto
    AND (v_import_id IS NULL OR import_id = v_import_id);

  -- Upsert link
  INSERT INTO public.tga_links (
    client_id, rto_number, is_linked, link_status, 
    last_sync_at, last_sync_status, last_sync_error
  )
  VALUES (
    p_client_id, v_rto, true, 'linked',
    now(), 'success', NULL
  )
  ON CONFLICT (client_id) DO UPDATE SET
    rto_number = EXCLUDED.rto_number,
    is_linked = true,
    link_status = 'linked',
    last_sync_at = now(),
    last_sync_status = 'success',
    last_sync_error = NULL,
    updated_at = now()
  RETURNING id INTO v_link_id;

  -- Upsert client snapshot
  INSERT INTO public.client_tga_snapshot (
    client_id, rto_number, rto_status, registration_end,
    scope_total, quals_total, units_total, skill_sets_total,
    last_sync_at, source_import_id
  )
  VALUES (
    p_client_id, v_rto, v_rto_data.status, v_rto_data.registration_end,
    COALESCE(v_scope_counts.total, 0),
    COALESCE(v_scope_counts.quals, 0),
    COALESCE(v_scope_counts.units, 0),
    COALESCE(v_scope_counts.skill_sets, 0),
    now(), v_import_id
  )
  ON CONFLICT (client_id) DO UPDATE SET
    rto_number = EXCLUDED.rto_number,
    rto_status = EXCLUDED.rto_status,
    registration_end = EXCLUDED.registration_end,
    scope_total = EXCLUDED.scope_total,
    quals_total = EXCLUDED.quals_total,
    units_total = EXCLUDED.units_total,
    skill_sets_total = EXCLUDED.skill_sets_total,
    last_sync_at = now(),
    source_import_id = v_import_id,
    updated_at = now();

  -- Audit log
  INSERT INTO public.client_audit_log (
    tenant_id, entity_type, entity_id, action, actor_user_id, details
  )
  SELECT 
    c.tenant_id, 'tga_link', v_link_id::text, 'tga.sync.completed', auth.uid(),
    jsonb_build_object(
      'rto_number', v_rto,
      'legal_name', v_rto_data.legal_name,
      'status', v_rto_data.status,
      'scope_total', COALESCE(v_scope_counts.total, 0),
      'quals_total', COALESCE(v_scope_counts.quals, 0),
      'units_total', COALESCE(v_scope_counts.units, 0),
      'skill_sets_total', COALESCE(v_scope_counts.skill_sets, 0),
      'import_id', v_import_id
    )
  FROM public.clients_legacy c
  WHERE c.id = p_client_id;

  RETURN jsonb_build_object(
    'success', true,
    'link_id', v_link_id,
    'rto_number', v_rto,
    'rto_data', jsonb_build_object(
      'legal_name', v_rto_data.legal_name,
      'trading_name', v_rto_data.trading_name,
      'abn', v_rto_data.abn,
      'status', v_rto_data.status,
      'registration_start', v_rto_data.registration_start,
      'registration_end', v_rto_data.registration_end
    ),
    'scope_counts', jsonb_build_object(
      'total', COALESCE(v_scope_counts.total, 0),
      'qualifications', COALESCE(v_scope_counts.quals, 0),
      'units', COALESCE(v_scope_counts.units, 0),
      'skill_sets', COALESCE(v_scope_counts.skill_sets, 0)
    ),
    'import_id', v_import_id
  );
END;
$$;

-- Function to unlink a client from TGA
CREATE OR REPLACE FUNCTION public.tga_unlink_client(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link record;
BEGIN
  -- Get current link
  SELECT * INTO v_link
  FROM public.tga_links
  WHERE client_id = p_client_id;

  IF v_link IS NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'No link to remove');
  END IF;

  -- Update link status
  UPDATE public.tga_links
  SET is_linked = false, link_status = 'unlinked', updated_at = now()
  WHERE client_id = p_client_id;

  -- Remove snapshot
  DELETE FROM public.client_tga_snapshot
  WHERE client_id = p_client_id;

  -- Audit log
  INSERT INTO public.client_audit_log (
    tenant_id, entity_type, entity_id, action, actor_user_id, details
  )
  SELECT 
    c.tenant_id, 'tga_link', v_link.id::text, 'tga.unlinked', auth.uid(),
    jsonb_build_object('rto_number', v_link.rto_number)
  FROM public.clients_legacy c
  WHERE c.id = p_client_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Client unlinked from TGA'
  );
END;
$$;

-- Function to get client TGA data
CREATE OR REPLACE FUNCTION public.tga_get_client_data(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link record;
  v_snapshot record;
  v_rto_data record;
  v_scope_items jsonb;
BEGIN
  -- Get link
  SELECT * INTO v_link
  FROM public.tga_links
  WHERE client_id = p_client_id;

  IF v_link IS NULL OR NOT v_link.is_linked THEN
    RETURN jsonb_build_object(
      'linked', false,
      'link_status', COALESCE(v_link.link_status, 'not_linked')
    );
  END IF;

  -- Get snapshot
  SELECT * INTO v_snapshot
  FROM public.client_tga_snapshot
  WHERE client_id = p_client_id;

  -- Get RTO data
  SELECT * INTO v_rto_data
  FROM public.tga_rtos
  WHERE rto_number = v_link.rto_number;

  -- Get scope items
  SELECT jsonb_agg(
    jsonb_build_object(
      'code', code,
      'type', type,
      'title', title,
      'status', status
    )
  ) INTO v_scope_items
  FROM public.tga_scope_items
  WHERE rto_number = v_link.rto_number
    AND (v_snapshot.source_import_id IS NULL OR import_id = v_snapshot.source_import_id);

  RETURN jsonb_build_object(
    'linked', true,
    'link_status', v_link.link_status,
    'rto_number', v_link.rto_number,
    'last_sync_at', v_link.last_sync_at,
    'last_sync_status', v_link.last_sync_status,
    'rto_data', CASE WHEN v_rto_data IS NOT NULL THEN jsonb_build_object(
      'legal_name', v_rto_data.legal_name,
      'trading_name', v_rto_data.trading_name,
      'abn', v_rto_data.abn,
      'status', v_rto_data.status,
      'registration_start', v_rto_data.registration_start,
      'registration_end', v_rto_data.registration_end,
      'phone', v_rto_data.phone,
      'email', v_rto_data.email,
      'website', v_rto_data.website,
      'address', v_rto_data.address_json
    ) ELSE NULL END,
    'snapshot', CASE WHEN v_snapshot IS NOT NULL THEN jsonb_build_object(
      'scope_total', v_snapshot.scope_total,
      'quals_total', v_snapshot.quals_total,
      'units_total', v_snapshot.units_total,
      'skill_sets_total', v_snapshot.skill_sets_total,
      'last_sync_at', v_snapshot.last_sync_at,
      'import_id', v_snapshot.source_import_id
    ) ELSE NULL END,
    'scope_items', COALESCE(v_scope_items, '[]'::jsonb)
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.tga_sync_client(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tga_unlink_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tga_get_client_data(uuid) TO authenticated;