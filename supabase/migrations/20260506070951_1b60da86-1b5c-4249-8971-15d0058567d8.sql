CREATE OR REPLACE FUNCTION public.accept_invitation_v2(p_token_hash text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invitation record;
  v_tu_role text;
  v_primary boolean;
  v_user_type public.user_type_enum;
  v_existing_uuid uuid;
  v_existing_accepted boolean;
  v_relationship_role public.tenant_user_role;
  v_resolved_unicorn_role public.unicorn_role;
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

  IF v_invitation.relationship_role IS NOT NULL THEN
    v_relationship_role := v_invitation.relationship_role;

    CASE v_relationship_role
      WHEN 'primary_contact', 'secondary_contact' THEN
        v_tu_role := 'parent';
        v_primary := (v_relationship_role = 'primary_contact');
        v_user_type := 'Client Parent';
        v_resolved_unicorn_role := 'Admin';
      WHEN 'user' THEN
        v_tu_role := 'child';
        v_primary := false;
        v_user_type := 'Client Child';
        v_resolved_unicorn_role := 'User';
      WHEN 'academy_user' THEN
        v_tu_role := 'child';
        v_primary := false;
        v_user_type := 'Client Child';
        v_resolved_unicorn_role := 'User';
    END CASE;
  ELSE
    IF v_invitation.unicorn_role::text = 'Admin' THEN
      v_tu_role := 'parent';
      v_primary := true;
      v_relationship_role := 'primary_contact';
      v_user_type := 'Client Parent';
      v_resolved_unicorn_role := 'Admin';
    ELSIF v_invitation.unicorn_role::text = 'User' THEN
      v_tu_role := 'child';
      v_primary := false;
      v_relationship_role := 'user';
      v_user_type := 'Client Child';
      v_resolved_unicorn_role := 'User';
    ELSE
      v_tu_role := 'child';
      v_primary := false;
      v_relationship_role := 'user';
      v_user_type := 'Vivacity Team';
      v_resolved_unicorn_role := v_invitation.unicorn_role::public.unicorn_role;
    END IF;
  END IF;

  IF v_invitation.tenant_id = 6372 THEN
    v_user_type := 'Vivacity Team';
  END IF;

  SELECT user_uuid INTO v_existing_uuid
  FROM public.users
  WHERE email = lower(v_invitation.email);

  IF v_existing_uuid IS NOT NULL AND v_existing_uuid <> p_user_id THEN
    UPDATE public.users
       SET user_uuid = p_user_id,
           first_name = COALESCE(NULLIF(v_invitation.first_name, ''), first_name),
           last_name  = COALESCE(NULLIF(v_invitation.last_name, ''), last_name),
           unicorn_role = v_resolved_unicorn_role,
           user_type = v_user_type,
           tenant_id = COALESCE(tenant_id, v_invitation.tenant_id),
           is_team = (v_user_type = 'Vivacity Team'),
           updated_at = now()
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
      v_resolved_unicorn_role,
      v_user_type,
      v_invitation.tenant_id,
      (v_user_type = 'Vivacity Team'),
      false,
      false
    );
  ELSE
    UPDATE public.users
       SET first_name = COALESCE(NULLIF(v_invitation.first_name, ''), first_name),
           last_name  = COALESCE(NULLIF(v_invitation.last_name, ''), last_name),
           unicorn_role = v_resolved_unicorn_role,
           user_type = v_user_type,
           tenant_id = COALESCE(tenant_id, v_invitation.tenant_id),
           updated_at = now()
     WHERE user_uuid = p_user_id;
  END IF;

  INSERT INTO public.tenant_users (
    user_id, tenant_id, role, primary_contact, access_scope, secondary_contact, relationship_role
  ) VALUES (
    p_user_id, v_invitation.tenant_id, v_tu_role, v_primary, 'full', false, v_relationship_role
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    primary_contact = EXCLUDED.primary_contact,
    relationship_role = CASE
      WHEN public.tenant_users.relationship_role = 'primary_contact' THEN 'primary_contact'::public.tenant_user_role
      WHEN public.tenant_users.relationship_role = 'secondary_contact' AND EXCLUDED.relationship_role IN ('user', 'academy_user') THEN 'secondary_contact'::public.tenant_user_role
      ELSE EXCLUDED.relationship_role
    END;

  -- Mirror membership into tenant_members (canonical RLS source)
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (
    v_invitation.tenant_id,
    p_user_id,
    CASE WHEN v_tu_role = 'parent' THEN 'Admin' ELSE 'General User' END,
    'active'
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    status = 'active',
    updated_at = now();

  -- Set the user's active tenant if they don't have one yet
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
      'unicorn_role', v_invitation.unicorn_role,
      'tenant_users_role', v_tu_role,
      'primary_contact', v_primary,
      'relationship_role', v_relationship_role::text,
      'invitation_relationship_role_source', CASE WHEN v_invitation.relationship_role IS NOT NULL THEN 'invitation_column' ELSE 'unicorn_role_fallback' END,
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
    'unicorn_role', v_invitation.unicorn_role,
    'primary_contact', v_primary,
    'relationship_role', v_relationship_role::text,
    'message', 'Invitation accepted successfully'
  );
END;
$function$;