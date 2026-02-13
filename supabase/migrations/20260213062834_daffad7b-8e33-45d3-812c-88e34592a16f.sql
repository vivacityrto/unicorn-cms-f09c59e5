
-- ============================================================
-- 1. Enhanced check_tenant_duplicates: detect ABN vs RTO ID
--    cross-tenant conflicts
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_tenant_duplicates(
  p_abn text DEFAULT NULL,
  p_rto_id text DEFAULT NULL,
  p_legal_name text DEFAULT NULL,
  p_trading_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_abn text;
  v_norm_rto text;
  v_norm_legal text;
  v_norm_trading text;
  v_matches jsonb := '[]'::jsonb;
  v_hard_block boolean := false;
  v_abn_tenant_id bigint;
  v_rto_tenant_id bigint;
  v_abn_tenant_name text;
  v_rto_tenant_name text;
  v_row record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_norm_abn := CASE WHEN p_abn IS NOT NULL AND trim(p_abn) <> ''
    THEN public.normalise_abn(p_abn) ELSE NULL END;
  v_norm_rto := CASE WHEN p_rto_id IS NOT NULL AND trim(p_rto_id) <> ''
    THEN lower(trim(p_rto_id)) ELSE NULL END;
  v_norm_legal := CASE WHEN p_legal_name IS NOT NULL AND trim(p_legal_name) <> ''
    THEN public.normalise_name(p_legal_name) ELSE NULL END;
  v_norm_trading := CASE WHEN p_trading_name IS NOT NULL AND trim(p_trading_name) <> ''
    THEN public.normalise_name(p_trading_name) ELSE NULL END;

  -- Resolve ABN tenant
  IF v_norm_abn IS NOT NULL AND length(v_norm_abn) = 11 THEN
    SELECT ti.tenant_id, t.name INTO v_abn_tenant_id, v_abn_tenant_name
    FROM tenant_identifiers ti
    JOIN tenants t ON t.id = ti.tenant_id
    WHERE ti.identifier_type = 'abn'
      AND lower(trim(ti.identifier_value)) = v_norm_abn
    LIMIT 1;
  END IF;

  -- Resolve RTO ID tenant
  IF v_norm_rto IS NOT NULL THEN
    SELECT ti.tenant_id, t.name INTO v_rto_tenant_id, v_rto_tenant_name
    FROM tenant_identifiers ti
    JOIN tenants t ON t.id = ti.tenant_id
    WHERE ti.identifier_type = 'rto_id'
      AND lower(trim(ti.identifier_value)) = v_norm_rto
    LIMIT 1;
  END IF;

  -- CROSS-TENANT CONFLICT: ABN and RTO ID resolve to different tenants
  IF v_abn_tenant_id IS NOT NULL AND v_rto_tenant_id IS NOT NULL
     AND v_abn_tenant_id <> v_rto_tenant_id THEN
    RETURN jsonb_build_object(
      'hard_block', true,
      'block_reason', 'identifier_conflict_requires_merge',
      'abn_tenant', jsonb_build_object(
        'tenant_id', v_abn_tenant_id,
        'name', v_abn_tenant_name,
        'identifier_type', 'abn',
        'identifier_value', v_norm_abn
      ),
      'rto_tenant', jsonb_build_object(
        'tenant_id', v_rto_tenant_id,
        'name', v_rto_tenant_name,
        'identifier_type', 'rto_id',
        'identifier_value', v_norm_rto
      ),
      'matches', jsonb_build_array(
        jsonb_build_object('tenant_id', v_abn_tenant_id, 'name', v_abn_tenant_name, 'match_type', 'abn', 'matched_value', v_norm_abn),
        jsonb_build_object('tenant_id', v_rto_tenant_id, 'name', v_rto_tenant_name, 'match_type', 'rto_id', 'matched_value', v_norm_rto)
      )
    );
  END IF;

  -- SAME-TENANT or SINGLE ID checks (existing logic)
  IF v_abn_tenant_id IS NOT NULL THEN
    v_hard_block := true;
    v_matches := v_matches || jsonb_build_object(
      'tenant_id', v_abn_tenant_id, 'name', v_abn_tenant_name,
      'match_type', 'abn', 'matched_value', v_norm_abn, 'legal_name', v_abn_tenant_name
    );
  END IF;

  IF v_rto_tenant_id IS NOT NULL THEN
    v_hard_block := true;
    v_matches := v_matches || jsonb_build_object(
      'tenant_id', v_rto_tenant_id, 'name', v_rto_tenant_name,
      'match_type', 'rto_id', 'matched_value', v_norm_rto, 'legal_name', v_rto_tenant_name
    );
  END IF;

  IF v_hard_block THEN
    RETURN jsonb_build_object(
      'hard_block', true,
      'block_reason', CASE WHEN v_abn_tenant_id IS NOT NULL THEN 'abn' ELSE 'rto_id' END,
      'matches', v_matches
    );
  END IF;

  -- Soft name match
  IF v_norm_legal IS NOT NULL THEN
    FOR v_row IN
      SELECT t.id AS tenant_id, t.name, t.legal_name, t.rto_id, t.abn
      FROM tenants t
      WHERE t.status = 'active'
        AND (
          public.normalise_name(t.legal_name) = v_norm_legal
          OR public.normalise_name(t.name) = v_norm_legal
          OR (v_norm_trading IS NOT NULL AND (
            public.normalise_name(t.legal_name) = v_norm_trading
            OR public.normalise_name(t.name) = v_norm_trading
          ))
        )
    LOOP
      v_matches := v_matches || jsonb_build_object(
        'tenant_id', v_row.tenant_id,
        'name', v_row.name,
        'legal_name', v_row.legal_name,
        'match_type', 'name',
        'matched_value', coalesce(v_row.legal_name, v_row.name)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('hard_block', false, 'matches', v_matches);
END;
$$;


-- ============================================================
-- 2. Merge tenants RPC
--    Moves all data from source to target, archives source
-- ============================================================

CREATE OR REPLACE FUNCTION public.merge_tenants(
  p_target_tenant_id bigint,
  p_source_tenant_id bigint,
  p_reason text DEFAULT 'Identifier conflict merge'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_target_name text;
  v_source_name text;
  v_impact jsonb := '{}'::jsonb;
  v_table_name text;
  v_count bigint;
  v_tables text[] := ARRAY[
    'package_instances','tenant_members','client_notes','client_action_items',
    'client_action_item_comments','client_alerts','client_audit_log',
    'client_commitments','client_document_requests','client_documents',
    'client_impact_items','client_impact_reports','client_packages',
    'client_package_stage_state','client_portal_sessions',
    'client_reminders_feed','client_tga_reviews','client_timeline_events',
    'connected_tenants','consult_time_entries','consults',
    'document_instances','document_links','documents_tenants',
    'email_messages','email_send_log','email_automation_log',
    'engagement_audit_log','compliance_score_snapshots',
    'audit_inspection','audit_invites',
    'calendar_entries','calendar_events','active_timers'
  ];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only SuperAdmins can merge tenants';
  END IF;

  IF p_target_tenant_id = p_source_tenant_id THEN
    RAISE EXCEPTION 'Cannot merge a tenant into itself';
  END IF;

  -- Validate both tenants exist
  SELECT name INTO v_target_name FROM tenants WHERE id = p_target_tenant_id;
  IF v_target_name IS NULL THEN
    RAISE EXCEPTION 'Target tenant % not found', p_target_tenant_id;
  END IF;

  SELECT name INTO v_source_name FROM tenants WHERE id = p_source_tenant_id;
  IF v_source_name IS NULL THEN
    RAISE EXCEPTION 'Source tenant % not found', p_source_tenant_id;
  END IF;

  -- Move data from source to target for each table
  FOREACH v_table_name IN ARRAY v_tables
  LOOP
    BEGIN
      EXECUTE format(
        'UPDATE public.%I SET tenant_id = $1 WHERE tenant_id = $2',
        v_table_name
      ) USING p_target_tenant_id, p_source_tenant_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count > 0 THEN
        v_impact := v_impact || jsonb_build_object(v_table_name, v_count);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Skip tables that don't exist or have constraint issues
      v_impact := v_impact || jsonb_build_object(v_table_name || '_error', SQLERRM);
    END;
  END LOOP;

  -- Move non-conflicting identifiers from source to target
  UPDATE tenant_identifiers
  SET tenant_id = p_target_tenant_id
  WHERE tenant_id = p_source_tenant_id
    AND NOT EXISTS (
      SELECT 1 FROM tenant_identifiers t2
      WHERE t2.tenant_id = p_target_tenant_id
        AND t2.identifier_type = tenant_identifiers.identifier_type
    );

  -- Archive conflicting identifiers as aliases
  INSERT INTO tenant_identifier_aliases (tenant_id, identifier_type, identifier_value, source_tenant_id)
  SELECT p_target_tenant_id, ti.identifier_type, ti.identifier_value, p_source_tenant_id
  FROM tenant_identifiers ti
  WHERE ti.tenant_id = p_source_tenant_id;

  -- Remove remaining source identifiers
  DELETE FROM tenant_identifiers WHERE tenant_id = p_source_tenant_id;

  -- Archive source tenant
  UPDATE tenants
  SET status = 'archived',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'merged_into', p_target_tenant_id,
        'merged_at', now()::text,
        'merged_by', v_user_id::text,
        'merge_reason', p_reason,
        'pre_merge_name', v_source_name
      ),
      updated_at = now()
  WHERE id = p_source_tenant_id;

  -- Audit log
  INSERT INTO audit_events (action, entity, entity_id, user_id, details)
  VALUES (
    'tenant.merge',
    'tenant',
    p_target_tenant_id::text,
    v_user_id,
    jsonb_build_object(
      'target_tenant_id', p_target_tenant_id,
      'target_name', v_target_name,
      'source_tenant_id', p_source_tenant_id,
      'source_name', v_source_name,
      'reason', p_reason,
      'impact', v_impact
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'target_tenant_id', p_target_tenant_id,
    'source_tenant_id', p_source_tenant_id,
    'target_name', v_target_name,
    'source_name', v_source_name,
    'impact', v_impact
  );
END;
$$;
