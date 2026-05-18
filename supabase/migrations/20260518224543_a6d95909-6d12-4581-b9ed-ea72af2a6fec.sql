-- =====================================================================
-- Phase 4D-4: Remove ::unicorn_role / ::public.unicorn_role casts from
-- the last three live function bodies.
--
-- Scope: handle_new_user, admin_set_role_type, accept_invitation_v2.
-- The legacy public.unicorn_role enum is intentionally retained.
-- No policies, triggers, columns, or other functions are touched.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- PRE-FLIGHT
-- ---------------------------------------------------------------------

-- dd_unicorn_roles has 6 active rows
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM public.dd_unicorn_roles WHERE is_active = true) <> 6
  THEN RAISE EXCEPTION '4D-4 pre-flight: dd_unicorn_roles row count unexpected'; END IF;
END $$;

-- All three target functions currently still contain ::unicorn_role casts
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.prokind = 'f'
        AND p.proname IN ('handle_new_user','admin_set_role_type','accept_invitation_v2')
        AND (pg_get_functiondef(p.oid) ILIKE '%::unicorn_role%'
          OR pg_get_functiondef(p.oid) ILIKE '%::public.unicorn_role%')) <> 3
  THEN RAISE EXCEPTION '4D-4 pre-flight: expected 3 functions with casts, found different count'; END IF;
END $$;

-- =====================================================================
-- FUNCTION 1: handle_new_user
-- Only change: remove two ::unicorn_role casts on the COALESCE expression.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE LOWER(email) = LOWER(NEW.email)) THEN
    UPDATE public.users
    SET user_uuid = NEW.id,
        updated_at = now()
    WHERE LOWER(email) = LOWER(NEW.email);
  ELSIF NOT EXISTS (SELECT 1 FROM public.users WHERE user_uuid = NEW.id) THEN
    INSERT INTO public.users (
      user_uuid, email, first_name, last_name, unicorn_role, user_type,
      tenant_id, phone, created_at, updated_at
    ) VALUES (
      NEW.id, NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'unicorn_role', 'User'),
      COALESCE(NEW.raw_user_meta_data->>'user_type', 'Member'),
      COALESCE((NEW.raw_user_meta_data->>'tenant_id')::bigint, NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      now(), now()
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- =====================================================================
-- FUNCTION 2: admin_set_role_type
-- Only change: drop ::public.unicorn_role cast on UPDATE (var is already text).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_set_role_type(p_user_uuid uuid, p_role_type text, p_tenant_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_unicorn_role text;
  v_user_type text;
  v_old_data jsonb;
  v_new_data jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: SuperAdmin only';
  END IF;

  CASE p_role_type
    WHEN 'superadmin_administrator' THEN
      v_unicorn_role := 'Super Admin';
      v_user_type := 'Vivacity';
    WHEN 'superadmin_team_leader' THEN
      v_unicorn_role := 'Super Admin';
      v_user_type := 'Vivacity Team';
    WHEN 'superadmin_general' THEN
      v_unicorn_role := 'User';
      v_user_type := 'Vivacity Team';
    WHEN 'tenant_parent' THEN
      v_unicorn_role := 'Admin';
      v_user_type := 'Client Parent';
    WHEN 'tenant_child' THEN
      v_unicorn_role := 'User';
      v_user_type := 'Client Child';
    ELSE
      RAISE EXCEPTION 'Invalid role_type: %', p_role_type;
  END CASE;

  SELECT jsonb_build_object(
    'unicorn_role', unicorn_role,
    'user_type', user_type,
    'tenant_id', tenant_id
  ) INTO v_old_data
  FROM public.users
  WHERE user_uuid = p_user_uuid;

  UPDATE public.users
  SET
    unicorn_role = v_unicorn_role,
    user_type = v_user_type,
    tenant_id = CASE
      WHEN p_role_type LIKE 'superadmin_%' THEN 319
      ELSE p_tenant_id
    END,
    updated_at = now()
  WHERE user_uuid = p_user_uuid;

  v_new_data := jsonb_build_object(
    'unicorn_role', v_unicorn_role,
    'user_type', v_user_type,
    'tenant_id', CASE WHEN p_role_type LIKE 'superadmin_%' THEN 319 ELSE p_tenant_id END
  );

  INSERT INTO public.audit_eos_events (
    tenant_id, entity, action, entity_id, user_id, details
  ) VALUES (
    319,
    'user_audit',
    'set_role_type',
    p_user_uuid::text,
    auth.uid(),
    jsonb_build_object('before', v_old_data, 'after', v_new_data, 'role_type', p_role_type)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_uuid', p_user_uuid,
    'role_type', p_role_type,
    'before', v_old_data,
    'after', v_new_data
  );
END;
$function$;

-- =====================================================================
-- FUNCTION 3: accept_invitation_v2
-- Changes:
--   (1) DECLARE v_u_unicorn_role  public.unicorn_role  ->  text
--   (2) Two v_invitation.unicorn_role::text  ->  v_invitation.unicorn_role
--   (3) Internal fallback :=  v_invitation.unicorn_role::public.unicorn_role -> drop cast
--   (4) Two v_u_unicorn_role::text in jsonb builders -> v_u_unicorn_role
-- =====================================================================
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
  v_tm_status               text;
  v_is_internal_fallback    boolean := false;
BEGIN
  IF p_token_hash IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PARAMS',
      'message', 'Missing required parameters');
  END IF;

  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE token_hash = p_token_hash AND status = 'pending';

  IF v_invitation IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_invitations
      WHERE token_hash = p_token_hash
        AND status IN ('accepted', 'successful')
    ) INTO v_existing_accepted;

    IF v_existing_accepted THEN
      RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_ACCEPTED',
        'message', 'Invitation already accepted');
    END IF;

    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TOKEN',
      'message', 'Invalid or expired invitation token');
  END IF;

  IF v_invitation.expires_at < now() THEN
    UPDATE public.user_invitations
       SET status = 'expired', updated_at = now()
     WHERE id = v_invitation.id;

    RETURN jsonb_build_object('ok', false, 'code', 'EXPIRED',
      'message', 'This invitation has expired');
  END IF;

  IF v_invitation.relationship_role IS NOT NULL THEN
    v_relationship_role := v_invitation.relationship_role;
  ELSIF v_invitation.unicorn_role = 'Admin' THEN
    v_relationship_role := 'primary_contact';
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
  END CASE;

  IF v_is_internal_fallback THEN
    v_u_user_type := 'Vivacity Team';
    IF v_invitation.unicorn_role IS NOT NULL THEN
      v_u_unicorn_role := v_invitation.unicorn_role;
    END IF;
    v_tm_role := 'Admin';
    v_tm_status := 'active';
  END IF;

  SELECT user_uuid INTO v_existing_uuid
  FROM public.users WHERE email = lower(v_invitation.email);

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
      p_user_id, lower(v_invitation.email),
      COALESCE(NULLIF(v_invitation.first_name, ''), '-'),
      COALESCE(NULLIF(v_invitation.last_name, ''), '-'),
      v_u_unicorn_role, v_u_user_type, v_invitation.tenant_id,
      (v_u_user_type = 'Vivacity Team'), false, false
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

  INSERT INTO public.tenant_users (
    user_id, tenant_id, role, primary_contact, secondary_contact,
    access_scope, relationship_role
  ) VALUES (
    p_user_id, v_invitation.tenant_id, v_tu_role, v_tu_primary,
    v_tu_secondary, v_tu_access_scope, v_relationship_role
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    relationship_role = EXCLUDED.relationship_role,
    role              = EXCLUDED.role,
    primary_contact   = EXCLUDED.primary_contact,
    secondary_contact = EXCLUDED.secondary_contact,
    access_scope      = EXCLUDED.access_scope;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (v_invitation.tenant_id, p_user_id, v_tm_role, v_tm_status)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    role       = EXCLUDED.role,
    status     = EXCLUDED.status,
    updated_at = now();

  UPDATE public.profiles
     SET active_tenant_id = (
           SELECT id_uuid FROM public.tenants
           WHERE id = v_invitation.tenant_id
         ),
         updated_at = now()
   WHERE user_id = p_user_id
     AND active_tenant_id IS NULL;

  UPDATE public.user_invitations
     SET status              = 'accepted',
         accepted_at         = now(),
         accepted_by_user_id = p_user_id,
         updated_at          = now()
   WHERE id = v_invitation.id;

  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_invitation.tenant_id, p_user_id, 'user_invitations', v_invitation.id,
    'invitation_accepted', 'User accepted invitation via self-service',
    jsonb_build_object(
      'email', v_invitation.email,
      'tenant_id', v_invitation.tenant_id,
      'unicorn_role', v_u_unicorn_role,
      'user_type', v_u_user_type::text,
      'tenant_users_role', v_tu_role,
      'primary_contact', v_tu_primary,
      'secondary_contact', v_tu_secondary,
      'access_scope', v_tu_access_scope,
      'relationship_role', v_relationship_role,
      'tm_role', v_tm_role,
      'tm_status', v_tm_status,
      'invitation_relationship_role_source',
        CASE WHEN v_invitation.relationship_role IS NOT NULL
             THEN 'invitation_column' ELSE 'unicorn_role_fallback' END,
      'internal_fallback', v_is_internal_fallback,
      'invitation_id', v_invitation.id,
      'relinked_from_uuid',
        CASE WHEN v_existing_uuid IS NOT NULL AND v_existing_uuid <> p_user_id
             THEN v_existing_uuid::text ELSE NULL END
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'SUCCESS',
    'tenant_id', v_invitation.tenant_id,
    'role', v_tu_role,
    'unicorn_role', v_u_unicorn_role,
    'primary_contact', v_tu_primary,
    'secondary_contact', v_tu_secondary,
    'access_scope', v_tu_access_scope,
    'relationship_role', v_relationship_role,
    'message', 'Invitation accepted successfully'
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- POST-MIGRATION CHECKS
-- ---------------------------------------------------------------------

-- 1. No ::unicorn_role / ::public.unicorn_role casts remain in any public function
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.prokind = 'f'
        AND (pg_get_functiondef(p.oid) ILIKE '%::unicorn_role%'
          OR pg_get_functiondef(p.oid) ILIKE '%::public.unicorn_role%')) > 0
  THEN RAISE EXCEPTION '4D-4 post-check: ::unicorn_role casts still present'; END IF;
END $$;

-- 2. dd_unicorn_roles still has 6 active rows
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM public.dd_unicorn_roles WHERE is_active = true) <> 6
  THEN RAISE EXCEPTION '4D-4 post-check: dd_unicorn_roles row count unexpected'; END IF;
END $$;

-- 3. FK still intact
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'users_unicorn_role_fk' AND contype = 'f') <> 1
  THEN RAISE EXCEPTION '4D-4 post-check: users_unicorn_role_fk missing'; END IF;
END $$;

-- 5. Legacy enum still in public
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unicorn_role'
    AND typnamespace = 'public'::regnamespace)
  THEN RAISE EXCEPTION '4D-4 post-check: public.unicorn_role enum missing'; END IF;
END $$;

COMMIT;

-- 4. Users row counts unchanged (informational SELECT -- run after COMMIT)
-- Expected: Admin 417, User 61, Super Admin 14, Team Member 9, Academy User 1
SELECT unicorn_role, COUNT(*) FROM public.users GROUP BY unicorn_role ORDER BY COUNT(*) DESC;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- Restore all three functions with their original casts using
-- CREATE OR REPLACE FUNCTION. The legacy public.unicorn_role enum is
-- still live, so the original cast-bearing bodies remain immediately
-- valid. See the Phase 4D-4 handoff document for the full rollback SQL
-- (verbatim prior bodies captured from pg_get_functiondef before this
-- migration ran).
-- =====================================================================
