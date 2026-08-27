-- ============================================================
-- accept_invitation_v2: auto-archive a matching tenant_contacts row
-- ============================================================
-- "Promote to User" on a contact now sends a real invitation email
-- (see TenantContactsSection.tsx) instead of creating the account
-- directly with skip_email:true — that path left promoted contacts
-- as unusable ghost accounts with no way to set a password (a real
-- client caller can't reach the staff-only activate-ghost-user
-- function). No user exists yet at the moment "Promote" is clicked,
-- so the contact can only be correctly archived and linked once the
-- invitation is actually accepted, here.
--
-- Additive only: same signature, same existing behaviour for every
-- invitation that doesn't happen to match an active contact row.
-- Safe to re-promote after a swap-to-contact — matches by
-- (tenant_id, lower(email)) against whichever tenant_contacts row is
-- currently 'active' for that person, same reactivate-on-conflict
-- pattern already used by swap_tenant_user_to_contact.

CREATE OR REPLACE FUNCTION public.accept_invitation_v2(p_token_hash text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invitation              record;
  v_existing_uuid           uuid;
  v_existing_accepted       boolean;
  v_relationship_role       text;
  v_tu_role                 text;
  v_tu_primary              boolean;
  v_tu_secondary            boolean;
  v_tu_access_scope         text;
  v_u_unicorn_role          text;
  v_u_user_type             text;
  v_tm_role                 text;
  v_tm_status                text;
  v_is_internal_fallback    boolean := false;
BEGIN
  IF p_token_hash IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PARAMS',
      'message', 'Missing required parameters');
  END IF;

  -- IDENTITY BINDING: a signed-in caller may only accept for their own uuid.
  -- Service-role/edge callers have auth.uid() = NULL and are allowed (they validate the token).
  IF (SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'IDENTITY_MISMATCH',
      'message', 'Invitation can only be accepted by the invited user');
  END IF;

  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE token_hash = p_token_hash AND status = 'pending';

  IF v_invitation IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_invitations
      WHERE token_hash = p_token_hash AND status IN ('accepted', 'successful')
    ) INTO v_existing_accepted;
    IF v_existing_accepted THEN
      RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_ACCEPTED',
        'message', 'Invitation already accepted');
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TOKEN',
      'message', 'Invalid or expired invitation token');
  END IF;

  IF v_invitation.expires_at < now() THEN
    UPDATE public.user_invitations SET status = 'expired', updated_at = now()
     WHERE id = v_invitation.id;
    RETURN jsonb_build_object('ok', false, 'code', 'EXPIRED',
      'message', 'This invitation has expired');
  END IF;

  IF v_invitation.relationship_role IS NOT NULL THEN
    v_relationship_role := v_invitation.relationship_role;
  ELSIF v_invitation.unicorn_role = 'Admin' THEN
    v_relationship_role := 'primary_contact';
  ELSIF v_invitation.tenant_id = 6372 THEN
    v_relationship_role := NULL;
  ELSE
    v_relationship_role := 'user';
  END IF;

  IF (v_invitation.relationship_role IS NULL
      AND v_invitation.unicorn_role NOT IN ('Admin','User'))
     OR v_invitation.tenant_id = 6372 THEN
    v_is_internal_fallback := true;
  END IF;

  CASE v_relationship_role
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
      NULL;
  END CASE;

  IF v_is_internal_fallback THEN
    v_tu_role := 'child'; v_tu_primary := false; v_tu_secondary := false;
    v_tu_access_scope := 'full'; v_u_user_type := 'Vivacity Team';
    IF v_invitation.unicorn_role IS NOT NULL THEN
      v_u_unicorn_role := v_invitation.unicorn_role;
    END IF;
    v_tm_role := 'Admin'; v_tm_status := 'active';
  END IF;

  SELECT user_uuid INTO v_existing_uuid
  FROM public.users WHERE email = lower(v_invitation.email);

  IF v_existing_uuid IS NOT NULL AND v_existing_uuid <> p_user_id THEN
    UPDATE public.users
       SET user_uuid = p_user_id,
           first_name = COALESCE(NULLIF(v_invitation.first_name, ''), first_name),
           last_name  = COALESCE(NULLIF(v_invitation.last_name, ''), last_name),
           unicorn_role = v_u_unicorn_role, user_type = v_u_user_type,
           tenant_id = COALESCE(tenant_id, v_invitation.tenant_id),
           is_team = (v_u_user_type = 'Vivacity Team'), updated_at = now()
     WHERE user_uuid = v_existing_uuid;
  ELSIF v_existing_uuid IS NULL THEN
    INSERT INTO public.users (
      user_uuid, email, first_name, last_name, unicorn_role, user_type,
      tenant_id, is_team, disabled, archived
    ) VALUES (
      p_user_id, lower(v_invitation.email),
      COALESCE(NULLIF(v_invitation.first_name, ''), '-'),
      COALESCE(NULLIF(v_invitation.last_name, ''), '-'),
      v_u_unicorn_role, v_u_user_type, v_invitation.tenant_id,
      (v_u_user_type = 'Vivacity Team'), false, false
    );
  ELSE
    UPDATE public.users
       SET first_name = COALESCE(NULLIF(v_invitation.first_name, ''), first_name),
           last_name  = COALESCE(NULLIF(v_invitation.last_name, ''), last_name),
           unicorn_role = v_u_unicorn_role, user_type = v_u_user_type,
           tenant_id = COALESCE(tenant_id, v_invitation.tenant_id), updated_at = now()
     WHERE user_uuid = p_user_id;
  END IF;

  INSERT INTO public.tenant_users (
    user_id, tenant_id, role, primary_contact, secondary_contact,
    access_scope, relationship_role
  ) VALUES (
    p_user_id, v_invitation.tenant_id, v_tu_role, v_tu_primary,
    v_tu_secondary, v_tu_access_scope, v_relationship_role
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    relationship_role = EXCLUDED.relationship_role, role = EXCLUDED.role,
    primary_contact = EXCLUDED.primary_contact, secondary_contact = EXCLUDED.secondary_contact,
    access_scope = EXCLUDED.access_scope;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (v_invitation.tenant_id, p_user_id, v_tm_role, v_tm_status)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    role = EXCLUDED.role, status = EXCLUDED.status, updated_at = now();

  UPDATE public.profiles
     SET active_tenant_id = (SELECT id_uuid FROM public.tenants WHERE id = v_invitation.tenant_id),
         updated_at = now()
   WHERE user_id = p_user_id AND active_tenant_id IS NULL;

  UPDATE public.user_invitations
     SET status = 'accepted', accepted_at = now(),
         accepted_by_user_id = p_user_id, updated_at = now()
   WHERE id = v_invitation.id;

  -- Archive + link any matching tenant_contacts row for this person, now
  -- that a real user actually exists. Matches the promote/swap RPCs'
  -- existing (tenant_id, lower(email)) matching convention.
  UPDATE public.tenant_contacts
     SET status = 'archived',
         promoted_to_user_id = p_user_id,
         promoted_at = now(),
         updated_at = now()
   WHERE tenant_id = v_invitation.tenant_id
     AND lower(email) = lower(v_invitation.email)
     AND status = 'active';

  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_invitation.tenant_id, p_user_id, 'user_invitations', v_invitation.id,
    'invitation_accepted', 'User accepted invitation via self-service',
    jsonb_build_object(
      'email', v_invitation.email, 'tenant_id', v_invitation.tenant_id,
      'unicorn_role', v_u_unicorn_role, 'user_type', v_u_user_type::text,
      'tenant_users_role', v_tu_role, 'primary_contact', v_tu_primary,
      'secondary_contact', v_tu_secondary, 'access_scope', v_tu_access_scope,
      'relationship_role', v_relationship_role, 'tm_role', v_tm_role, 'tm_status', v_tm_status,
      'invitation_relationship_role_source',
        CASE WHEN v_invitation.relationship_role IS NOT NULL THEN 'invitation_column' ELSE 'unicorn_role_fallback' END,
      'internal_fallback', v_is_internal_fallback, 'invitation_id', v_invitation.id,
      'relinked_from_uuid',
        CASE WHEN v_existing_uuid IS NOT NULL AND v_existing_uuid <> p_user_id THEN v_existing_uuid::text ELSE NULL END
    )
  );

  RETURN jsonb_build_object(
    'ok', true, 'code', 'SUCCESS', 'tenant_id', v_invitation.tenant_id,
    'role', v_tu_role, 'unicorn_role', v_u_unicorn_role,
    'primary_contact', v_tu_primary, 'secondary_contact', v_tu_secondary,
    'access_scope', v_tu_access_scope, 'relationship_role', v_relationship_role,
    'message', 'Invitation accepted successfully'
  );
END;
$function$;
