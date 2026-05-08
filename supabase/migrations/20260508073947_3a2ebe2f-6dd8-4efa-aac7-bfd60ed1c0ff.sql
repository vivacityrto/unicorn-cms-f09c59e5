DO $smoke$
DECLARE
  v_user_uuid uuid := gen_random_uuid();
  v_tenant_id bigint;
  v_can_access boolean;
  v_jwt jsonb;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE '[smoke] No tenants exist — skipping';
    RETURN;
  END IF;

  INSERT INTO public.users (user_uuid, email, first_name, last_name, unicorn_role)
  VALUES (v_user_uuid, 'smoke+sec@vivacity.test', 'Smoke', 'Secondary', 'User');

  INSERT INTO public.tenant_users (
    user_id, tenant_id, role, access_scope, primary_contact, secondary_contact
  ) VALUES (
    v_user_uuid, v_tenant_id, 'child', 'full', false, true
  );

  v_jwt := jsonb_build_object('sub', v_user_uuid::text, 'role', 'authenticated');
  PERFORM set_config('request.jwt.claims', v_jwt::text, true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT app.user_can_access_tenant(v_tenant_id) INTO v_can_access;

  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);

  DELETE FROM public.tenant_users WHERE user_id = v_user_uuid;
  DELETE FROM public.users WHERE user_uuid = v_user_uuid;

  IF v_can_access IS DISTINCT FROM true THEN
    RAISE EXCEPTION '[smoke] RLS regression: secondary contact (full) was DENIED access (got %).', v_can_access;
  END IF;

  RAISE NOTICE '[smoke] OK: secondary contact with access_scope=full can access tenant %', v_tenant_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('role', 'postgres', true);
  DELETE FROM public.tenant_users WHERE user_id = v_user_uuid;
  DELETE FROM public.users WHERE user_uuid = v_user_uuid;
  RAISE;
END
$smoke$;