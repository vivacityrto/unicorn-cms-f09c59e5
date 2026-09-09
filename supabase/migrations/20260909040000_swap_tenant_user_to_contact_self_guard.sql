-- Guard swap_tenant_user_to_contact against self-targeting (L10 #31).
--
-- Both UI callers (TenantUsersTab.tsx staff-side, ClientUsersPage.tsx client
-- portal) already hide the "Swap to Contact" menu item for the signed-in
-- caller's own row (added 2026-08-27, PR #423) -- but the RPC itself never
-- checked p_user_id against the caller. A tenant parent/admin could still
-- self-swap by calling the RPC directly, bypassing both UI guards entirely,
-- and immediately lose their own Unicorn login and seat. The existing
-- "at least one other admin contact must remain" check does not prevent
-- this: it only blocks removing the tenant's *last* admin-tier contact, so
-- any tenant with two or more admin contacts (e.g. a primary + a secondary)
-- lets either one swap themselves out with no other guard in the way.
--
-- Same signature (bigint, uuid, text) -- CREATE OR REPLACE is sufficient,
-- no DROP FUNCTION/grant changes needed.

CREATE OR REPLACE FUNCTION public.swap_tenant_user_to_contact(
  p_tenant_id bigint,
  p_user_id   uuid,
  p_reason    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller           uuid := auth.uid();
  v_tu_id            bigint;
  v_relationship_role text;
  v_position_type    text;
  v_first_name       text;
  v_last_name        text;
  v_email            text;
  v_full_name        text;
  v_other_admins     int;
  v_existing_contact_id bigint;
  v_contact_id       bigint;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_tenant_parent_safe(p_tenant_id, v_caller)
    OR public.is_super_admin_safe(v_caller)
    OR public.is_vivacity_staff(v_caller)
  ) THEN
    RAISE EXCEPTION 'Not authorized to manage users for tenant %', p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id = v_caller THEN
    RAISE EXCEPTION 'Cannot swap yourself to a contact — ask another admin to do this for you'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id, relationship_role, position_type
    INTO v_tu_id, v_relationship_role, v_position_type
  FROM public.tenant_users
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  IF v_tu_id IS NULL THEN
    RAISE EXCEPTION 'tenant_users row not found for tenant=% user=%',
      p_tenant_id, p_user_id;
  END IF;

  IF v_relationship_role IN ('primary_contact', 'secondary_contact') THEN
    SELECT COUNT(*) INTO v_other_admins
    FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND id <> v_tu_id
      AND relationship_role IN ('primary_contact', 'secondary_contact');

    IF v_other_admins = 0 THEN
      RAISE EXCEPTION 'Cannot swap the tenant''s only admin contact — assign another Primary or Secondary Contact first'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT first_name, last_name, email
    INTO v_first_name, v_last_name, v_email
  FROM public.users
  WHERE user_uuid = p_user_id;

  v_full_name := NULLIF(trim(both ' ' FROM concat_ws(' ', v_first_name, v_last_name)), '');

  SELECT id INTO v_existing_contact_id
  FROM public.tenant_contacts
  WHERE tenant_id = p_tenant_id AND lower(email) = lower(v_email);

  IF v_existing_contact_id IS NOT NULL THEN
    UPDATE public.tenant_contacts
       SET first_name = COALESCE(NULLIF(v_first_name, ''), first_name),
           last_name = COALESCE(NULLIF(v_last_name, ''), last_name),
           position_type = COALESCE(v_position_type, position_type),
           status = 'active',
           promoted_to_user_id = NULL,
           promoted_at = NULL,
           updated_at = now()
     WHERE id = v_existing_contact_id
     RETURNING id INTO v_contact_id;
  ELSE
    INSERT INTO public.tenant_contacts (
      tenant_id, first_name, last_name, email, position_type, status, created_by
    ) VALUES (
      p_tenant_id, COALESCE(NULLIF(v_first_name, ''), 'Unnamed'), v_last_name, v_email,
      v_position_type, 'active', v_caller
    )
    RETURNING id INTO v_contact_id;
  END IF;

  DELETE FROM public.tenant_users WHERE id = v_tu_id;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    INSERT INTO public.audit_eos_events (
      tenant_id, user_id, entity, entity_id, action, reason, details
    ) VALUES (
      p_tenant_id, p_user_id, 'tenant_users', NULL, 'swapped_to_contact', p_reason,
      jsonb_build_object(
        'tu_id', v_tu_id,
        'contact_id', v_contact_id,
        'old_relationship_role', v_relationship_role,
        'position_type', v_position_type,
        'changed_by', v_caller
      )
    );
  END IF;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, metadata, occurred_at, created_by, source, visibility
  ) VALUES (
    p_tenant_id,
    p_tenant_id::text,
    'user_swapped_to_contact',
    format('%s: User → Contact', COALESCE(v_full_name, v_email, 'User')),
    p_reason,
    'tenant_contacts',
    v_contact_id::text,
    jsonb_build_object(
      'tu_id', v_tu_id,
      'contact_id', v_contact_id,
      'old_relationship_role', v_relationship_role,
      'position_type', v_position_type,
      'changed_by', v_caller
    ),
    now(),
    v_caller,
    'user',
    'internal'
  );

  RETURN jsonb_build_object('ok', true, 'contact_id', v_contact_id, 'tenant_id', p_tenant_id);
END;
$function$;
