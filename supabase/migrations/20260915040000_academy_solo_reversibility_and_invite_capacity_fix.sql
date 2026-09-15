-- Keep the published one-argument capacity RPC contract. The invite Edge
-- Function now uses the validated caller session when it checks capacity.

-- Academy Solo is an explicit marker, not a permanent seat-cap mutation.
-- Preserve the pre-Solo cap when entering the pilot so staff can safely undo
-- an accidental toggle on an existing RTO Academy tenant. Disable removes the
-- marker and restores that cap (or uses the requested cap for older markers).
CREATE OR REPLACE FUNCTION public.manage_academy_solo_access(
  p_tenant_id bigint,
  p_action text,
  p_enabled boolean,
  p_max_users integer DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_solo_pilot boolean DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_previous_enabled boolean;
  v_previous_expires_at timestamptz;
  v_previous_max_users integer;
  v_metadata jsonb;
  v_existing_solo jsonb;
  v_has_restore_cap boolean := false;
  v_restore_max_users integer;
BEGIN
  IF NOT public.is_vivacity_team_safe((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Forbidden: Academy Solo lifecycle is staff-only'
      USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('activate', 'suspend', 'reactivate', 'end', 'settings_updated') THEN
    RAISE EXCEPTION 'Invalid Academy Solo lifecycle action: %', p_action
      USING ERRCODE = '22023';
  END IF;

  SELECT academy_access_enabled,
         academy_subscription_expires_at,
         academy_max_users,
         COALESCE(metadata, '{}'::jsonb)
    INTO v_previous_enabled,
         v_previous_expires_at,
         v_previous_max_users,
         v_metadata
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found: %', p_tenant_id
      USING ERRCODE = 'P0002';
  END IF;

  v_existing_solo := v_metadata -> 'academy_solo';
  IF jsonb_typeof(v_existing_solo) = 'object'
     AND v_existing_solo ? 'previous_max_users' THEN
    v_has_restore_cap := true;
    IF jsonb_typeof(v_existing_solo -> 'previous_max_users') = 'number' THEN
      v_restore_max_users := (v_existing_solo ->> 'previous_max_users')::integer;
    END IF;
  END IF;

  UPDATE public.tenants
  SET academy_access_enabled = p_enabled,
      academy_max_users = CASE
        WHEN p_is_solo_pilot THEN 1
        WHEN v_has_restore_cap THEN v_restore_max_users
        ELSE p_max_users
      END,
      academy_subscription_expires_at = p_expires_at,
      metadata = CASE
        WHEN p_is_solo_pilot THEN
          jsonb_set(
            jsonb_set(
              v_metadata,
              '{academy_notes}',
              COALESCE(to_jsonb(p_notes), 'null'::jsonb),
              true
            ),
            '{academy_solo}',
            COALESCE(v_existing_solo, '{}'::jsonb) || jsonb_build_object(
              'status', p_action,
              'previous_max_users', COALESCE(
                v_existing_solo -> 'previous_max_users',
                to_jsonb(v_previous_max_users)
              ),
              'last_changed_at', now(),
              'last_changed_by', (SELECT auth.uid())
            ),
            true
          )
        ELSE jsonb_set(
          v_metadata - 'academy_solo',
          '{academy_notes}',
          COALESCE(to_jsonb(p_notes), 'null'::jsonb),
          true
        )
      END
  WHERE id = p_tenant_id;

  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    p_tenant_id,
    (SELECT auth.uid()),
    'academy_solo_access',
    NULL,
    p_action,
    'Academy Solo lifecycle change',
    jsonb_build_object(
      'previous_enabled', v_previous_enabled,
      'enabled', p_enabled,
      'previous_expires_at', v_previous_expires_at,
      'expires_at', p_expires_at,
      'previous_max_users', v_previous_max_users,
      'max_users', p_max_users,
      'solo_marker_removed', NOT p_is_solo_pilot,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'action', p_action,
    'enabled', p_enabled,
    'solo_pilot', p_is_solo_pilot
  );
END;
$$;

COMMENT ON FUNCTION public.manage_academy_solo_access(bigint, text, boolean, integer, timestamptz, text, boolean) IS
  'Staff-only, audited Academy Solo pilot lifecycle update. Solo seat caps and metadata markers are reversible; no package or RTO membership is created.';

REVOKE ALL ON FUNCTION public.manage_academy_solo_access(bigint, text, boolean, integer, timestamptz, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_academy_solo_access(bigint, text, boolean, integer, timestamptz, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.manage_academy_solo_access(bigint, text, boolean, integer, timestamptz, text, boolean) TO authenticated, service_role;
