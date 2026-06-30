-- =====================================================================
-- 1. One-time backfill (guarded; expects exactly 3 drifted rows)
-- =====================================================================
DO $$
DECLARE
  v_drift_count int;
  v_row record;
BEGIN
  SELECT count(*) INTO v_drift_count
  FROM tenants t
  JOIN tenant_csc_assignments tca
    ON tca.tenant_id = t.id AND tca.is_primary = true
  WHERE t.assigned_consultant_user_id IS NOT NULL
    AND t.assigned_consultant_user_id != tca.csc_user_id;

  IF v_drift_count != 3 THEN
    RAISE EXCEPTION 'Expected 3 drifted tenant rows, found %. Aborting backfill — data may have changed since this migration was written.', v_drift_count;
  END IF;

  FOR v_row IN
    SELECT t.id AS tenant_id,
           t.assigned_consultant_user_id AS old_consultant,
           tca.csc_user_id AS new_consultant
    FROM tenants t
    JOIN tenant_csc_assignments tca
      ON tca.tenant_id = t.id AND tca.is_primary = true
    WHERE t.assigned_consultant_user_id IS NOT NULL
      AND t.assigned_consultant_user_id != tca.csc_user_id
  LOOP
    INSERT INTO client_audit_log (tenant_id, action, entity_type, entity_id, before_data, after_data, details)
    VALUES (
      v_row.tenant_id,
      'consultant_field_backfill',
      'tenants',
      v_row.tenant_id::text,
      jsonb_build_object('assigned_consultant_user_id', v_row.old_consultant),
      jsonb_build_object('assigned_consultant_user_id', v_row.new_consultant),
      jsonb_build_object('reason', 'Align legacy capacity column with current primary CSC')
    );
  END LOOP;

  UPDATE tenants t
  SET assigned_consultant_user_id = tca.csc_user_id
  FROM tenant_csc_assignments tca
  WHERE tca.tenant_id = t.id
    AND tca.is_primary = true
    AND t.assigned_consultant_user_id IS NOT NULL
    AND t.assigned_consultant_user_id != tca.csc_user_id;
END $$;

-- =====================================================================
-- 2. Bulk reassignment RPC
-- =====================================================================
CREATE OR REPLACE FUNCTION public.bulk_reassign_primary_csc(
  p_from_user_id uuid,
  p_to_user_id   uuid,
  p_tenant_ids   bigint[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_from_valid boolean;
  v_to_valid boolean;
  v_from_name text;
  v_to_name text;
  v_reassigned bigint[] := ARRAY[]::bigint[];
  v_skipped jsonb := '[]'::jsonb;
  v_tid bigint;
  v_current_primary uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT unicorn_role INTO v_caller_role FROM public.users WHERE user_uuid = v_caller;
  IF v_caller_role NOT IN ('Super Admin', 'Team Leader') THEN
    RAISE EXCEPTION 'Forbidden: caller role % is not permitted to perform bulk CSC reassignment', COALESCE(v_caller_role, '<none>');
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'from_user_id and to_user_id must differ';
  END IF;

  SELECT (is_csc AND NOT COALESCE(archived,false) AND NOT COALESCE(disabled,false)),
         COALESCE(NULLIF(trim(concat(first_name,' ',last_name)),''), email)
    INTO v_from_valid, v_from_name
    FROM public.users WHERE user_uuid = p_from_user_id;
  IF NOT COALESCE(v_from_valid, false) THEN
    RAISE EXCEPTION 'from_user_id is not an active CSC';
  END IF;

  SELECT (is_csc AND NOT COALESCE(archived,false) AND NOT COALESCE(disabled,false)),
         COALESCE(NULLIF(trim(concat(first_name,' ',last_name)),''), email)
    INTO v_to_valid, v_to_name
    FROM public.users WHERE user_uuid = p_to_user_id;
  IF NOT COALESCE(v_to_valid, false) THEN
    RAISE EXCEPTION 'to_user_id is not an active CSC';
  END IF;

  IF p_tenant_ids IS NULL OR array_length(p_tenant_ids,1) IS NULL THEN
    RAISE EXCEPTION 'tenant_ids must be a non-empty array';
  END IF;

  FOREACH v_tid IN ARRAY p_tenant_ids LOOP
    SELECT csc_user_id INTO v_current_primary
    FROM tenant_csc_assignments
    WHERE tenant_id = v_tid AND is_primary = true
    LIMIT 1;

    IF v_current_primary IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('tenant_id', v_tid, 'reason', 'No primary CSC row found');
      CONTINUE;
    ELSIF v_current_primary != p_from_user_id THEN
      v_skipped := v_skipped || jsonb_build_object('tenant_id', v_tid, 'reason', 'Primary CSC is no longer the from user');
      CONTINUE;
    END IF;

    UPDATE tenant_csc_assignments
      SET csc_user_id = p_to_user_id,
          assigned_since = now(),
          updated_at = now()
      WHERE tenant_id = v_tid
        AND csc_user_id = p_from_user_id
        AND is_primary = true;

    UPDATE tenants
      SET assigned_consultant_user_id = p_to_user_id
      WHERE id = v_tid
        AND assigned_consultant_user_id = p_from_user_id;

    INSERT INTO client_audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, details)
    VALUES (
      v_tid,
      v_caller,
      'bulk_csc_reassignment',
      'tenant_csc_assignments',
      v_tid::text,
      jsonb_build_object('csc_user_id', p_from_user_id, 'csc_name', v_from_name),
      jsonb_build_object('csc_user_id', p_to_user_id, 'csc_name', v_to_name),
      jsonb_build_object('role_scope','primary_csc')
    );

    v_reassigned := v_reassigned || v_tid;
  END LOOP;

  RETURN jsonb_build_object(
    'reassigned', to_jsonb(v_reassigned),
    'skipped', v_skipped
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_reassign_primary_csc(uuid, uuid, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_reassign_primary_csc(uuid, uuid, bigint[]) TO authenticated;