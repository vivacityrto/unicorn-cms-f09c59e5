-- =====================================================================
-- BUG-017 Part 1: set_relationship_role RPC
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_relationship_role(
  p_tenant_id bigint,
  p_user_id uuid,
  p_relationship_role public.tenant_user_role,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_staff boolean := false;
  v_is_tenant_admin boolean := false;
  v_tu_id bigint;
  v_old_role public.tenant_user_role;
  v_tu_role text;
  v_tu_primary boolean;
  v_tu_secondary boolean;
  v_tu_access_scope text;
  v_u_unicorn_role public.unicorn_role;
  v_u_user_type public.user_type_enum;
  v_tm_role text;
  v_tm_status text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL OR p_user_id IS NULL OR p_relationship_role IS NULL THEN
    RAISE EXCEPTION 'set_relationship_role: missing required parameters';
  END IF;

  v_is_staff := public.is_super_admin_safe(v_caller) OR public.is_vivacity_team_safe(v_caller);

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
      v_tu_role := 'parent'; v_tu_primary := true;  v_tu_secondary := false; v_tu_access_scope := 'full';
      v_u_unicorn_role := 'Admin'; v_u_user_type := 'Client Parent';
      v_tm_role := 'Admin'; v_tm_status := 'active';
    WHEN 'secondary_contact' THEN
      v_tu_role := 'parent'; v_tu_primary := false; v_tu_secondary := true;  v_tu_access_scope := 'full';
      v_u_unicorn_role := 'Admin'; v_u_user_type := 'Client Parent';
      v_tm_role := 'Admin'; v_tm_status := 'active';
    WHEN 'user' THEN
      v_tu_role := 'child';  v_tu_primary := false; v_tu_secondary := false; v_tu_access_scope := 'full';
      v_u_unicorn_role := 'User'; v_u_user_type := 'Client Child';
      v_tm_role := 'General User'; v_tm_status := 'active';
    WHEN 'academy_user' THEN
      v_tu_role := 'child';  v_tu_primary := false; v_tu_secondary := false; v_tu_access_scope := 'academy_only';
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
    RAISE EXCEPTION 'tenant_users row not found for tenant=% user=%', p_tenant_id, p_user_id;
  END IF;

  -- 1. tenant_users (no updated_at column on this table)
  UPDATE public.tenant_users
     SET relationship_role = p_relationship_role,
         role              = v_tu_role,
         primary_contact   = v_tu_primary,
         secondary_contact = v_tu_secondary,
         access_scope      = v_tu_access_scope
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  -- 2. users mirror
  UPDATE public.users
     SET unicorn_role = v_u_unicorn_role,
         user_type    = v_u_user_type,
         updated_at   = now()
   WHERE user_uuid = p_user_id;

  -- 3. tenant_members upsert
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (p_tenant_id, p_user_id, v_tm_role, v_tm_status)
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role       = EXCLUDED.role,
        status     = EXCLUDED.status,
        updated_at = now();

  -- 4. Audit
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
      'old_relationship_role', v_old_role::text,
      'new_relationship_role', p_relationship_role::text,
      'tu_role', v_tu_role,
      'tu_primary_contact', v_tu_primary,
      'tu_secondary_contact', v_tu_secondary,
      'tu_access_scope', v_tu_access_scope,
      'tm_role', v_tm_role,
      'tm_status', v_tm_status,
      'changed_by', v_caller
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'user_id', p_user_id,
    'relationship_role', p_relationship_role::text,
    'access_scope', v_tu_access_scope,
    'tm_status', v_tm_status
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_relationship_role(bigint, uuid, public.tenant_user_role, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_relationship_role(bigint, uuid, public.tenant_user_role, text) TO authenticated, service_role;

-- =====================================================================
-- BUG-017 Part 2: rewrite accept_invitation_v2
-- Preserves: INVALID_PARAMS, INVALID_TOKEN, ALREADY_ACCEPTED, EXPIRED return codes,
--            email-based relink (CASCADE FKs), Vivacity-Team / tenant 6372 fallback.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.accept_invitation_v2(p_token_hash text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invitation record;
  v_existing_uuid uuid;
  v_existing_accepted boolean;
  v_relationship_role public.tenant_user_role;
  v_tu_role text;
  v_tu_primary boolean;
  v_tu_secondary boolean;
  v_tu_access_scope text;
  v_u_unicorn_role public.unicorn_role;
  v_u_user_type public.user_type_enum;
  v_tm_role text;
  v_tm_status text;
  v_is_internal_fallback boolean := false;
BEGIN
  IF p_token_hash IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PARAMS', 'message', 'Missing required parameters');
  END IF;

  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE token_hash = p_token_hash
    AND status = 'pending';

  IF v_invitation IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_invitations
      WHERE token_hash = p_token_hash AND status IN ('accepted', 'successful')
    ) INTO v_existing_accepted;

    IF v_existing_accepted THEN
      RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_ACCEPTED', 'message', 'Invitation already accepted');
    END IF;

    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TOKEN', 'message', 'Invalid or expired invitation token');
  END IF;

  IF v_invitation.expires_at < now() THEN
    UPDATE public.user_invitations
       SET status = 'expired', updated_at = now()
     WHERE id = v_invitation.id;
    RETURN jsonb_build_object('ok', false, 'code', 'EXPIRED', 'message', 'This invitation has expired');
  END IF;

  -- Resolve final v_relationship_role
  IF v_invitation.relationship_role IS NOT NULL THEN
    v_relationship_role := v_invitation.relationship_role;
  ELSIF v_invitation.unicorn_role::text = 'Admin' THEN
    v_relationship_role := 'primary_contact';
  ELSE
    v_relationship_role := 'user';
  END IF;

  -- Internal Vivacity fallback: invitation has no explicit relationship_role and unicorn_role
  -- is neither Admin nor User (e.g. Super Admin, Team Leader, Team Member, Academy User staff seat),
  -- OR the tenant is the internal Vivacity tenant (6372).
  IF (v_invitation.relationship_role IS NULL
      AND v_invitation.unicorn_role::text NOT IN ('Admin','User'))
     OR v_invitation.tenant_id = 6372 THEN
    v_is_internal_fallback := true;
  END IF;

  -- Derive all dependent fields from the SAME final v_relationship_role
  CASE v_relationship_role
    WHEN 'primary_contact' THEN
      v_tu_role := 'parent'; v_tu_primary := true;  v_tu_secondary := false; v_tu_access_scope := 'full';
      v_u_unicorn_role := 'Admin'; v_u_user_type := 'Client Parent';
      v_tm_role := 'Admin'; v_tm_status := 'active';
    WHEN 'secondary_contact' THEN
      v_tu_role := 'parent'; v_tu_primary := false; v_tu_secondary := true;  v_tu_access_scope := 'full';
      v_u_unicorn_role := 'Admin'; v_u_user_type := 'Client Parent';
      v_tm_role := 'Admin'; v_tm_status := 'active';
    WHEN 'user' THEN
      v_tu_role := 'child';  v_tu_primary := false; v_tu_secondary := false; v_tu_access_scope := 'full';
      v_u_unicorn_role := 'User'; v_u_user_type := 'Client Child';
      v_tm_role := 'General User'; v_tm_status := 'active';
    WHEN 'academy_user' THEN
      v_tu_role := 'child';  v_tu_primary := false; v_tu_secondary := false; v_tu_access_scope := 'academy_only';
      v_u_unicorn_role := 'Academy User'; v_u_user_type := 'Client Child';
      v_tm_role := 'General User'; v_tm_status := 'inactive';
  END CASE;

  -- Internal/Vivacity overrides (preserve legacy behavior). users.user_type becomes Vivacity Team
  -- and unicorn_role keeps the invitation's role; tenant_members stays Admin/active for internal.
  IF v_is_internal_fallback THEN
    v_u_user_type := 'Vivacity Team';
    IF v_invitation.unicorn_role IS NOT NULL THEN
      v_u_unicorn_role := v_invitation.unicorn_role::public.unicorn_role;
    END IF;
    v_tm_role := 'Admin';
    v_tm_status := 'active';
  END IF;

  -- users row: relink-by-email if needed (CASCADE FKs handle re-pointing)
  SELECT user_uuid INTO v_existing_uuid
  FROM public.users
  WHERE email = lower(v_invitation.email);

  IF v_existing_uuid IS NOT NULL AND v_existing_uuid <> p_user_id THEN
    UPDATE public.users
       SET user_uuid    = p_user_id,
           first_name   = COALESCE(NULLIF(v_invitation.first_name, ''), first_name),
           last_name    = COALESCE(NULLIF(v_invitation.last_name, ''), last_name),
           unicorn_role = v_u_unicorn_role,
           user_type    = v_u_user_type,
           tenant_id    = COALESCE(tenant_id, v_invitation.tenant_id),
           is_team      = (v_u_user_type = 'Vivacity Team'),
           updated_at   = now()
     WHERE user_uuid = v_existing_uuid;
  ELSIF v_existing_uuid IS NULL THEN
    INSERT INTO public.users (
      user_uuid, email, first_name, last_name, unicorn_role, user_type,
      tenant_id, is_team, disabled, archived
    ) VALUES (
      p_user_id,
      lower(v_invitation.email),
      COALESCE(NULLIF(v_invitation.first_name, ''), '-'),
      COALESCE(NULLIF(v_invitation.last_name, ''), '-'),
      v_u_unicorn_role,
      v_u_user_type,
      v_invitation.tenant_id,
      (v_u_user_type = 'Vivacity Team'),
      false,
      false
    );
  ELSE
    UPDATE public.users
       SET first_name   = COALESCE(NULLIF(v_invitation.first_name, ''), first_name),
           last_name    = COALESCE(NULLIF(v_invitation.last_name, ''), last_name),
           unicorn_role = v_u_unicorn_role,
           user_type    = v_u_user_type,
           tenant_id    = COALESCE(tenant_id, v_invitation.tenant_id),
           updated_at   = now()
     WHERE user_uuid = p_user_id;
  END IF;

  -- tenant_users: ON CONFLICT derives ALL fields from EXCLUDED (same final role)
  INSERT INTO public.tenant_users (
    user_id, tenant_id, role, primary_contact, secondary_contact, access_scope, relationship_role
  ) VALUES (
    p_user_id, v_invitation.tenant_id, v_tu_role, v_tu_primary, v_tu_secondary, v_tu_access_scope, v_relationship_role
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    relationship_role = EXCLUDED.relationship_role,
    role              = EXCLUDED.role,
    primary_contact   = EXCLUDED.primary_contact,
    secondary_contact = EXCLUDED.secondary_contact,
    access_scope      = EXCLUDED.access_scope;

  -- tenant_members mirror (status mirrors academy → inactive; internal stays active)
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (v_invitation.tenant_id, p_user_id, v_tm_role, v_tm_status)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    role       = EXCLUDED.role,
    status     = EXCLUDED.status,
    updated_at = now();

  -- Active tenant default
  UPDATE public.profiles
     SET active_tenant_id = (
           SELECT id_uuid FROM public.tenants WHERE id = v_invitation.tenant_id
         ),
         updated_at = now()
   WHERE user_id = p_user_id
     AND active_tenant_id IS NULL;

  UPDATE public.user_invitations
     SET status = 'accepted',
         accepted_at = now(),
         accepted_by_user_id = p_user_id,
         updated_at = now()
   WHERE id = v_invitation.id;

  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_invitation.tenant_id,
    p_user_id,
    'user_invitations',
    v_invitation.id,
    'invitation_accepted',
    'User accepted invitation via self-service',
    jsonb_build_object(
      'email', v_invitation.email,
      'tenant_id', v_invitation.tenant_id,
      'unicorn_role', v_u_unicorn_role::text,
      'user_type', v_u_user_type::text,
      'tenant_users_role', v_tu_role,
      'primary_contact', v_tu_primary,
      'secondary_contact', v_tu_secondary,
      'access_scope', v_tu_access_scope,
      'relationship_role', v_relationship_role::text,
      'tm_role', v_tm_role,
      'tm_status', v_tm_status,
      'invitation_relationship_role_source', CASE WHEN v_invitation.relationship_role IS NOT NULL THEN 'invitation_column' ELSE 'unicorn_role_fallback' END,
      'internal_fallback', v_is_internal_fallback,
      'invitation_id', v_invitation.id,
      'relinked_from_uuid', CASE WHEN v_existing_uuid IS NOT NULL AND v_existing_uuid <> p_user_id
                                 THEN v_existing_uuid::text ELSE NULL END
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'SUCCESS',
    'tenant_id', v_invitation.tenant_id,
    'role', v_tu_role,
    'unicorn_role', v_u_unicorn_role::text,
    'primary_contact', v_tu_primary,
    'secondary_contact', v_tu_secondary,
    'access_scope', v_tu_access_scope,
    'relationship_role', v_relationship_role::text,
    'message', 'Invitation accepted successfully'
  );
END;
$function$;

-- =====================================================================
-- BUG-017 Part 3: narrow drift cleanup (one-shot)
-- =====================================================================
WITH affected AS (
  SELECT tu.tenant_id, tu.user_id
  FROM public.tenant_users tu
  JOIN public.tenant_members tm USING (tenant_id, user_id)
  WHERE (tu.access_scope = 'academy_only' OR tu.relationship_role = 'academy_user')
    AND (tm.status = 'active' OR tm.role <> 'General User')
), upd AS (
  UPDATE public.tenant_members tm
     SET role = 'General User', status = 'inactive', updated_at = now()
    FROM affected a
   WHERE tm.tenant_id = a.tenant_id AND tm.user_id = a.user_id
  RETURNING tm.tenant_id, tm.user_id
)
INSERT INTO public.audit_eos_events (tenant_id, user_id, entity, action, reason, details)
SELECT tenant_id, user_id, 'tenant_members', 'academy_drift_cleanup',
       'BUG-017 cleanup: align tenant_members with academy_only tenant_users',
       jsonb_build_object('tm_role','General User','tm_status','inactive')
FROM upd;