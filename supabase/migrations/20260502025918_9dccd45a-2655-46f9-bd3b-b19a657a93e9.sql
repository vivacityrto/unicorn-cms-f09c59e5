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
  v_user_type text;
  v_existing_accepted boolean;
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

  IF v_invitation.unicorn_role = 'Admin' THEN
    v_tu_role := 'parent';
    v_primary := true;
  ELSE
    v_tu_role := 'child';
    v_primary := false;
  END IF;

  IF v_invitation.tenant_id = 6372 THEN
    v_user_type := 'Vivacity';
  ELSE
    v_user_type := 'Client';
  END IF;

  -- FIX: cast to public.unicorn_role (correct type name), not public.unicorn_role_enum
  INSERT INTO public.users (
    user_uuid, email, first_name, last_name, unicorn_role, user_type,
    tenant_id, is_team, disabled, archived
  ) VALUES (
    p_user_id,
    lower(v_invitation.email),
    COALESCE(NULLIF(v_invitation.first_name, ''), '-'),
    COALESCE(NULLIF(v_invitation.last_name, ''), '-'),
    v_invitation.unicorn_role::public.unicorn_role,
    v_user_type::public.user_type_enum,
    v_invitation.tenant_id,
    (v_user_type = 'Vivacity'),
    false,
    false
  )
  ON CONFLICT (user_uuid) DO UPDATE SET
    email = EXCLUDED.email,
    unicorn_role = EXCLUDED.unicorn_role,
    tenant_id = COALESCE(public.users.tenant_id, EXCLUDED.tenant_id),
    updated_at = now();

  INSERT INTO public.tenant_users (
    user_id, tenant_id, role, primary_contact, access_scope, secondary_contact
  ) VALUES (
    p_user_id, v_invitation.tenant_id, v_tu_role, v_primary, 'full', false
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    primary_contact = EXCLUDED.primary_contact;

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
      'invitation_id', v_invitation.id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'SUCCESS',
    'tenant_id', v_invitation.tenant_id,
    'role', v_tu_role,
    'unicorn_role', v_invitation.unicorn_role,
    'primary_contact', v_primary,
    'message', 'Invitation accepted successfully'
  );
END;
$function$;

COMMENT ON FUNCTION public.accept_invitation_v2 IS 'Atomically accepts an invitation: validates token, creates tenant membership, syncs unicorn_role to users table, and marks invitation as accepted. Returns JSON with ok, code, and details. Cast uses public.unicorn_role (live working version, prevents regression of the public.unicorn_role_enum typo).';