CREATE OR REPLACE FUNCTION public.set_relationship_role(p_tenant_id bigint, p_user_id uuid, p_relationship_role text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller         uuid := auth.uid();
  v_is_staff       boolean := false;
  v_is_tenant_admin boolean := false;
  v_tu_id          bigint;
  v_old_role       text;
  v_tu_role        text;
  v_tu_primary     boolean;
  v_tu_secondary   boolean;
  v_tu_access_scope text;
  v_u_unicorn_role text;
  v_u_user_type    text;
  v_tm_role        text;
  v_tm_status      text;
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

  CASE p_relationship_role
    WHEN 'primary_contact' THEN
      v_tu_role := 'parent'; v_tu_primary := true;  v_tu_secondary := false;
      v_tu_access_scope := 'full';
      v_u_unicorn_role := 'Admin'; v_u_user_type := 'Client Parent';
      v_tm_role := 'Admin'; v_tm_status := 'active';
    WHEN 'secondary_contact' THEN
      v_tu_role := 'parent'; v_tu_primary := false; v_tu_secondary := true;
      v_tu_access_scope := 'full';
      v_u_unicorn_role := 'Admin'; v_u_user_type := 'Client Parent';
      v_tm_role := 'Admin'; v_tm_status := 'active';
    WHEN 'user' THEN
      v_tu_role := 'child';  v_tu_primary := false; v_tu_secondary := false;
      v_tu_access_scope := 'full';
      v_u_unicorn_role := 'User'; v_u_user_type := 'Client Child';
      v_tm_role := 'General User'; v_tm_status := 'active';
    WHEN 'academy_user' THEN
      v_tu_role := 'child';  v_tu_primary := false; v_tu_secondary := false;
      v_tu_access_scope := 'academy_only';
      v_u_unicorn_role := 'Academy User'; v_u_user_type := 'Client Child';
      v_tm_role := 'General User'; v_tm_status := 'inactive';
    ELSE
      RAISE EXCEPTION 'Unsupported relationship_role %', p_relationship_role;
  END CASE;

  SELECT id, relationship_role
    INTO v_tu_id, v_old_role
  FROM public.tenant_users
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  IF v_tu_id IS NULL THEN
    RAISE EXCEPTION 'tenant_users row not found for tenant=% user=%',
      p_tenant_id, p_user_id;
  END IF;

  UPDATE public.tenant_users
     SET relationship_role = p_relationship_role,
         role              = v_tu_role,
         primary_contact   = v_tu_primary,
         secondary_contact = v_tu_secondary,
         access_scope      = v_tu_access_scope
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  UPDATE public.users
     SET unicorn_role = v_u_unicorn_role,
         user_type    = v_u_user_type,
         updated_at   = now()
   WHERE user_uuid = p_user_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (p_tenant_id, p_user_id, v_tm_role, v_tm_status)
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role       = EXCLUDED.role,
        status     = EXCLUDED.status,
        updated_at = now();

  -- Audit insert is wrapped in a subtransaction so that "ghost" users
  -- (imported from Unicorn 1.0 with no auth.users row) do not cause the
  -- FK on audit_eos_events.user_id -> auth.users(id) to abort the entire
  -- role change. The parallel fn_audit_tenant_users trigger still writes
  -- audit_user_events for the tenant_users UPDATE above.
  BEGIN
    INSERT INTO public.audit_eos_events (
      tenant_id, user_id, entity, entity_id, action, reason, details
    ) VALUES (
      p_tenant_id,
      p_user_id,
      'tenant_users',
      NULL,
      'relationship_role_changed',
      p_reason,
      jsonb_build_object(
        'tu_id', v_tu_id,
        'old_relationship_role', v_old_role,
        'new_relationship_role', p_relationship_role,
        'tu_role', v_tu_role,
        'tu_primary_contact', v_tu_primary,
        'tu_secondary_contact', v_tu_secondary,
        'tu_access_scope', v_tu_access_scope,
        'tm_role', v_tm_role,
        'tm_status', v_tm_status,
        'changed_by', v_caller
      )
    );
  EXCEPTION WHEN foreign_key_violation THEN
    -- Ghost user: no auth.users row for p_user_id. Skip audit_eos_events
    -- row silently; audit_user_events still captures the change.
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'user_id', p_user_id,
    'relationship_role', p_relationship_role,
    'access_scope', v_tu_access_scope,
    'tm_status', v_tm_status
  );
END;
$function$;