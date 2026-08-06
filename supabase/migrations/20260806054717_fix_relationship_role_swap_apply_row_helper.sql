CREATE OR REPLACE FUNCTION public._apply_relationship_role_row(
  p_tenant_id bigint,
  p_user_id uuid,
  p_relationship_role text,
  p_reason text DEFAULT NULL,
  p_changed_by uuid DEFAULT NULL,
  p_emit_timeline boolean DEFAULT true,
  p_override_old_role text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller         uuid := COALESCE(p_changed_by, auth.uid());
  v_tu_id          bigint;
  v_old_role       text;
  v_reported_old   text;
  v_tu_role        text;
  v_tu_primary     boolean;
  v_tu_secondary   boolean;
  v_tu_access_scope text;
  v_u_unicorn_role text;
  v_u_user_type    text;
  v_tm_role        text;
  v_tm_status      text;
  v_full_name      text;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL OR p_relationship_role IS NULL THEN
    RAISE EXCEPTION '_apply_relationship_role_row: missing required parameters';
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
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_tu_id IS NULL THEN
    RAISE EXCEPTION 'tenant_users row not found for tenant=% user=%',
      p_tenant_id, p_user_id;
  END IF;

  -- After an intermediate unique-slot clear the DB old role may be 'user'
  -- while the user-visible transition started from primary/secondary.
  v_reported_old := COALESCE(p_override_old_role, v_old_role);

  IF v_old_role IS NOT DISTINCT FROM p_relationship_role THEN
    RETURN jsonb_build_object(
      'ok', true,
      'changed', false,
      'tenant_id', p_tenant_id,
      'user_id', p_user_id,
      'relationship_role', p_relationship_role,
      'old_relationship_role', v_reported_old
    );
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
         tenant_id    = COALESCE(tenant_id, p_tenant_id),
         updated_at   = now()
   WHERE user_uuid = p_user_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (p_tenant_id, p_user_id, v_tm_role, v_tm_status)
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role       = EXCLUDED.role,
        status     = EXCLUDED.status,
        updated_at = now();

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
        'old_relationship_role', v_reported_old,
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
    RAISE WARNING '_apply_relationship_role_row: audit_eos_events insert skipped for user % in tenant % — no auth.users row (ghost user).',
      p_user_id, p_tenant_id;
  END;

  IF p_emit_timeline THEN
    SELECT trim(both ' ' FROM concat_ws(' ', u.first_name, u.last_name))
      INTO v_full_name
    FROM public.users u
    WHERE u.user_uuid = p_user_id;

    IF v_full_name IS NULL OR v_full_name = '' THEN
      SELECT u.email INTO v_full_name
      FROM public.users u
      WHERE u.user_uuid = p_user_id;
    END IF;

    INSERT INTO public.client_timeline_events (
      tenant_id, client_id, event_type, title, body,
      entity_type, entity_id, metadata, occurred_at, created_by, source, visibility
    ) VALUES (
      p_tenant_id,
      p_tenant_id::text,
      'account_role_changed',
      format(
        '%s: %s → %s',
        COALESCE(NULLIF(v_full_name, ''), 'User'),
        public.relationship_role_label(v_reported_old),
        public.relationship_role_label(p_relationship_role)
      ),
      NULL,
      'user',
      p_user_id::text,
      jsonb_build_object(
        'previous_role', v_reported_old,
        'new_role', p_relationship_role,
        'target_name', v_full_name,
        'changed_by', v_caller
      ),
      now(),
      v_caller,
      'user',
      'internal'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'changed', true,
    'tenant_id', p_tenant_id,
    'user_id', p_user_id,
    'relationship_role', p_relationship_role,
    'old_relationship_role', v_reported_old,
    'access_scope', v_tu_access_scope,
    'tm_status', v_tm_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._apply_relationship_role_row(bigint, uuid, text, text, uuid, boolean, text) FROM PUBLIC;
-- Internal helper only — not granted to authenticated.

