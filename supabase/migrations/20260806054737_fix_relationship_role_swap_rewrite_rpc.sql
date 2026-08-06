CREATE OR REPLACE FUNCTION public.set_relationship_role(
  p_tenant_id bigint,
  p_user_id uuid,
  p_relationship_role text,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller              uuid := auth.uid();
  v_is_staff            boolean := false;
  v_is_tenant_admin     boolean := false;
  v_old_role            text;
  v_visible_old_role    text;
  v_existing_primary    uuid;
  v_existing_secondary  uuid;
  v_demote_primary_to   text;
  v_result              jsonb;
  v_side                jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL OR p_user_id IS NULL OR p_relationship_role IS NULL THEN
    RAISE EXCEPTION 'set_relationship_role: missing required parameters';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dd_relationship_role
    WHERE value = p_relationship_role AND is_active = true
  ) THEN
    RAISE EXCEPTION 'set_relationship_role: invalid relationship_role value: %',
      p_relationship_role;
  END IF;

  v_is_staff := public.is_super_admin_safe(v_caller)
             OR public.is_vivacity_team_safe(v_caller);

  IF NOT v_is_staff THEN
    SELECT EXISTS (
      SELECT 1 FROM public.tenant_users
      WHERE tenant_id = p_tenant_id
        AND user_id = v_caller
        AND relationship_role IN ('primary_contact','secondary_contact')
        AND access_scope = 'full'
    ) INTO v_is_tenant_admin;

    IF NOT v_is_tenant_admin THEN
      RAISE EXCEPTION 'Not authorized to change roles for tenant %', p_tenant_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT relationship_role INTO v_old_role
  FROM public.tenant_users
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_users row not found for tenant=% user=%',
      p_tenant_id, p_user_id;
  END IF;

  IF v_old_role IS NOT DISTINCT FROM p_relationship_role THEN
    RETURN jsonb_build_object(
      'ok', true,
      'changed', false,
      'tenant_id', p_tenant_id,
      'user_id', p_user_id,
      'relationship_role', p_relationship_role
    );
  END IF;

  v_visible_old_role := v_old_role;

  -- Free unique slots before applying the requested role.
  IF p_relationship_role = 'primary_contact' THEN
    SELECT user_id INTO v_existing_primary
    FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND relationship_role = 'primary_contact'
      AND user_id <> p_user_id
    LIMIT 1
    FOR UPDATE;

    SELECT user_id INTO v_existing_secondary
    FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND relationship_role = 'secondary_contact'
      AND user_id <> p_user_id
    LIMIT 1
    FOR UPDATE;

    IF v_existing_primary IS NOT NULL THEN
      -- If the promotee currently occupies secondary, clear that slot first
      -- without writing timeline/audit (intermediate step only).
      IF v_old_role = 'secondary_contact' THEN
        UPDATE public.tenant_users
           SET relationship_role = 'user',
               role = 'child',
               primary_contact = false,
               secondary_contact = false,
               access_scope = 'full'
         WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
      END IF;

      -- Prefer demoting the outgoing primary to secondary when the slot is
      -- free (or we just freed it). Otherwise fall back to User so we never
      -- leave two secondaries.
      IF v_existing_secondary IS NULL THEN
        v_demote_primary_to := 'secondary_contact';
      ELSE
        v_demote_primary_to := 'user';
      END IF;

      v_side := public._apply_relationship_role_row(
        p_tenant_id, v_existing_primary, v_demote_primary_to, p_reason, v_caller, true, NULL
      );
    END IF;

  ELSIF p_relationship_role = 'secondary_contact' THEN
    SELECT user_id INTO v_existing_secondary
    FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND relationship_role = 'secondary_contact'
      AND user_id <> p_user_id
    LIMIT 1
    FOR UPDATE;

    IF v_existing_secondary IS NOT NULL THEN
      -- Replace existing secondary: demote them to User first.
      v_side := public._apply_relationship_role_row(
        p_tenant_id, v_existing_secondary, 'user', p_reason, v_caller, true, NULL
      );
    END IF;

    -- If promotee is currently primary, free primary slot via an intermediate
    -- clear so the subsequent apply can land on secondary cleanly.
    IF v_old_role = 'primary_contact' THEN
      UPDATE public.tenant_users
         SET relationship_role = 'user',
             role = 'child',
             primary_contact = false,
             secondary_contact = false,
             access_scope = 'full'
       WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
    END IF;
  END IF;

  v_result := public._apply_relationship_role_row(
    p_tenant_id, p_user_id, p_relationship_role, p_reason, v_caller, true, v_visible_old_role
  );

  RETURN v_result || jsonb_build_object(
    'side_effect', COALESCE(v_side, 'null'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_relationship_role(bigint, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_relationship_role(bigint, uuid, text, text) TO authenticated, service_role;

