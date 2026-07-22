-- M3 (14 Jul 2026 Unicorn security audit follow-up): toggle-user-status's edge-level
-- isClientAdmin check is being widened (in a parallel Cursor PR) to accept
-- user_type IN ('Client','Client Parent'), matching send-password-reset's isTenantAdmin
-- check. But the actual authoritative re-check happens here, in
-- rpc_set_client_account_status, which the edge function explicitly routes through
-- because it "re-checks permissions server-side" -- and this RPC still only allowed
-- user_type = 'Client'. Without this change, a Client Parent admin (the user_type
-- invite-user assigns to primary/secondary tenant contacts) would pass the widened edge
-- check and then get 'Forbidden' from this RPC anyway, making the edge-function fix a
-- no-op. Widening both together keeps the edge gate and the DB gate in sync.
CREATE OR REPLACE FUNCTION public.rpc_set_client_account_status(p_user_uuid uuid, p_disabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_target   RECORD;
  v_actor    RECORD;
  v_allowed  boolean := false;
  v_full_name text;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT user_uuid, tenant_id, first_name, last_name, email, disabled
    INTO v_target
    FROM public.users
   WHERE user_uuid = p_user_uuid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found');
  END IF;

  -- Permission check: SuperAdmin via central RPC, OR same-tenant client Admin
  BEGIN
    SELECT public.check_permission(v_actor_id, 'admin.team_users.manage', 'full')
      INTO v_allowed;
  EXCEPTION WHEN OTHERS THEN
    v_allowed := false;
  END;

  IF NOT v_allowed THEN
    SELECT unicorn_role, user_type, tenant_id
      INTO v_actor
      FROM public.users
     WHERE user_uuid = v_actor_id;

    IF FOUND
       AND v_actor.unicorn_role = 'Admin'
       AND v_actor.user_type IN ('Client', 'Client Parent')
       AND v_actor.tenant_id    = v_target.tenant_id
    THEN
      v_allowed := true;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  -- Idempotent short-circuit
  IF COALESCE(v_target.disabled, false) = COALESCE(p_disabled, false) THEN
    RETURN jsonb_build_object('success', true, 'unchanged', true);
  END IF;

  UPDATE public.users
     SET disabled   = p_disabled,
         updated_at = now()
   WHERE user_uuid = p_user_uuid;

  v_full_name := TRIM(COALESCE(v_target.first_name, '') || ' ' || COALESCE(v_target.last_name, ''));
  IF v_full_name = '' THEN
    v_full_name := COALESCE(v_target.email, 'user');
  END IF;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, created_by, source, visibility,
    event_type, title, entity_type, entity_id, metadata
  ) VALUES (
    v_target.tenant_id,
    v_target.tenant_id::text,
    v_actor_id,
    'user',
    'internal',
    CASE WHEN p_disabled THEN 'account_deactivated' ELSE 'account_activated' END,
    CASE WHEN p_disabled THEN 'Account deactivated: ' ELSE 'Account activated: ' END || v_full_name,
    'user',
    p_user_uuid::text,
    jsonb_build_object(
      'target_email', v_target.email,
      'target_name',  v_full_name
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

NOTIFY pgrst, 'reload schema';