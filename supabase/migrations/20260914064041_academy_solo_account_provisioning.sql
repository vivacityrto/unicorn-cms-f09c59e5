-- Academy Solo MVP: provision an Academy-only customer account without the
-- RTO client/package workflow. The existing tenant row remains the temporary
-- isolation boundary for current Academy tables, but its RTO profile and
-- operational services stay disabled and empty.
CREATE OR REPLACE FUNCTION public.create_academy_solo_account(
  p_account_name text,
  p_notes text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint;
  v_slug text;
  v_name text := NULLIF(btrim(p_account_name), '');
BEGIN
  IF v_actor IS NULL OR NOT public.is_vivacity_team_safe(v_actor) THEN
    RAISE EXCEPTION 'Forbidden: Academy Solo account creation is staff-only'
      USING ERRCODE = '42501';
  END IF;

  IF v_name IS NULL OR length(v_name) < 2 THEN
    RAISE EXCEPTION 'Academy Solo account name is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'Academy Solo pilot end date must be in the future'
      USING ERRCODE = '22023';
  END IF;

  v_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  IF v_slug = '' THEN
    v_slug := 'academy-solo';
  END IF;
  v_slug := left(v_slug, 180) || '-' || substr(gen_random_uuid()::text, 1, 8);

  INSERT INTO public.tenants (
    name,
    slug,
    academy_access_enabled,
    academy_max_users,
    academy_subscription_expires_at,
    compliance_system_enabled,
    resource_hub_enabled,
    documents_enabled,
    metadata
  ) VALUES (
    v_name,
    v_slug,
    true,
    1,
    p_expires_at,
    false,
    false,
    false,
    jsonb_build_object(
      'academy_account_type', 'individual',
      'academy_solo', jsonb_build_object(
        'status', 'pending_invitation',
        'plan_code', 'academy_solo',
        'catalogue_scope', 'all_published_courses',
        'created_at', now(),
        'created_by', v_actor,
        'last_changed_at', now(),
        'last_changed_by', v_actor
      ),
      'academy_notes', p_notes
    )
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_tenant_id,
    v_actor,
    'academy_solo_account',
    NULL,
    'created',
    'Academy Solo account provisioned without RTO client workflow',
    jsonb_build_object(
      'account_type', 'individual',
      'plan_code', 'academy_solo',
      'catalogue_scope', 'all_published_courses',
      'max_users', 1,
      'expires_at', p_expires_at,
      'notes', p_notes,
      'rto_profile_created', false,
      'package_created', false,
      'payment_created', false
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'account_name', v_name,
    'account_type', 'individual',
    'plan_code', 'academy_solo',
    'catalogue_scope', 'all_published_courses',
    'max_users', 1
  );
END;
$$;

COMMENT ON FUNCTION public.create_academy_solo_account(text, text, timestamptz) IS
  'Staff-only Academy Solo account provisioning. Reuses tenants as an isolation boundary but does not create an RTO profile, package instance, payment, or compliance workflow.';

REVOKE ALL ON FUNCTION public.create_academy_solo_account(text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_academy_solo_account(text, text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_academy_solo_account(text, text, timestamptz) TO authenticated, service_role;
