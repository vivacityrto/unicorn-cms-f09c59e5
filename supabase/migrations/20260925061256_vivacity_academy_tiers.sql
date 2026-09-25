-- Extends the Academy Solo MVP into named Vivacity Academy tiers (Solo=1
-- seat, Team=10 seats, Elite=unlimited), still manually assigned by staff —
-- no Stripe/billing wiring yet, matching the product's MVP posture. Both
-- RPCs gain a purely additive, defaulted trailing parameter, so no existing
-- call signature changes and no DROP FUNCTION is required.
--
-- The metadata JSON key stays `academy_solo` (all 4 production tenants that
-- have ever used this flag already carry that key) — it now also carries a
-- `tier` field. A tenant with the key but no `tier` field is backfilled
-- below to tier='solo', since every existing Academy Solo tenant is, by
-- construction, a 1-seat pilot today.

BEGIN;

CREATE OR REPLACE FUNCTION public.manage_academy_solo_access(
  p_tenant_id bigint,
  p_action text,
  p_enabled boolean,
  p_max_users integer DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_solo_pilot boolean DEFAULT FALSE,
  p_academy_tier text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_previous_enabled boolean;
  v_previous_expires_at timestamptz;
  v_previous_max_users integer;
  v_metadata jsonb;
  v_existing_tier_meta jsonb;
  v_has_restore_cap boolean := false;
  v_restore_max_users integer;
  v_tier text;
BEGIN
  IF NOT public.is_vivacity_team_safe((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Forbidden: Vivacity Academy tier lifecycle is staff-only'
      USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('activate', 'suspend', 'reactivate', 'end', 'settings_updated') THEN
    RAISE EXCEPTION 'Invalid Vivacity Academy lifecycle action: %', p_action
      USING ERRCODE = '22023';
  END IF;

  v_tier := NULLIF(p_academy_tier, '');
  IF v_tier IS NULL AND p_is_solo_pilot THEN
    v_tier := 'solo';
  END IF;
  IF v_tier IS NOT NULL AND v_tier NOT IN ('solo', 'team', 'elite') THEN
    RAISE EXCEPTION 'Invalid Vivacity Academy tier: %', v_tier
      USING ERRCODE = '22023';
  END IF;

  SELECT academy_access_enabled,
         academy_subscription_expires_at,
         academy_max_users,
         COALESCE(metadata, '{}'::jsonb)
    INTO v_previous_enabled,
         v_previous_expires_at,
         v_previous_max_users,
         v_metadata
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found: %', p_tenant_id
      USING ERRCODE = 'P0002';
  END IF;

  v_existing_tier_meta := v_metadata -> 'academy_solo';
  IF jsonb_typeof(v_existing_tier_meta) = 'object'
     AND v_existing_tier_meta ? 'previous_max_users' THEN
    v_has_restore_cap := true;
    IF jsonb_typeof(v_existing_tier_meta -> 'previous_max_users') = 'number' THEN
      v_restore_max_users := (v_existing_tier_meta ->> 'previous_max_users')::integer;
    END IF;
  END IF;

  UPDATE public.tenants
  SET academy_access_enabled = p_enabled,
      academy_max_users = CASE
        WHEN v_tier = 'solo' THEN 1
        WHEN v_tier = 'team' THEN 10
        WHEN v_tier = 'elite' THEN NULL
        WHEN v_has_restore_cap THEN v_restore_max_users
        ELSE p_max_users
      END,
      academy_subscription_expires_at = p_expires_at,
      metadata = CASE
        WHEN v_tier IS NOT NULL THEN
          jsonb_set(
            jsonb_set(
              v_metadata,
              '{academy_notes}',
              COALESCE(to_jsonb(p_notes), 'null'::jsonb),
              true
            ),
            '{academy_solo}',
            COALESCE(v_existing_tier_meta, '{}'::jsonb) || jsonb_build_object(
              'tier', v_tier,
              'status', p_action,
              'previous_max_users', COALESCE(
                v_existing_tier_meta -> 'previous_max_users',
                to_jsonb(v_previous_max_users)
              ),
              'last_changed_at', now(),
              'last_changed_by', (SELECT auth.uid())
            ),
            true
          )
        ELSE jsonb_set(
          v_metadata - 'academy_solo',
          '{academy_notes}',
          COALESCE(to_jsonb(p_notes), 'null'::jsonb),
          true
        )
      END
  WHERE id = p_tenant_id;

  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    p_tenant_id,
    (SELECT auth.uid()),
    'academy_solo_access',
    NULL,
    p_action,
    'Vivacity Academy tier lifecycle change',
    jsonb_build_object(
      'previous_enabled', v_previous_enabled,
      'enabled', p_enabled,
      'previous_expires_at', v_previous_expires_at,
      'expires_at', p_expires_at,
      'previous_max_users', v_previous_max_users,
      'max_users', p_max_users,
      'academy_tier', v_tier,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'action', p_action,
    'enabled', p_enabled,
    'academy_tier', v_tier
  );
END;
$$;

COMMENT ON FUNCTION public.manage_academy_solo_access(bigint, text, boolean, integer, timestamptz, text, boolean, text) IS
  'Staff-only, audited Vivacity Academy tier (solo/team/elite) lifecycle update. Seat caps and metadata markers are reversible; no package or RTO membership is created. MVP: tier assignment is manual, no Stripe billing yet.';

REVOKE ALL ON FUNCTION public.manage_academy_solo_access(bigint, text, boolean, integer, timestamptz, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_academy_solo_access(bigint, text, boolean, integer, timestamptz, text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.manage_academy_solo_access(bigint, text, boolean, integer, timestamptz, text, boolean, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_academy_solo_account(
  p_account_name text,
  p_notes text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_tier text DEFAULT 'solo'
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
  v_tier text := COALESCE(NULLIF(p_tier, ''), 'solo');
  v_max_users integer;
  v_plan_code text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_vivacity_team_safe(v_actor) THEN
    RAISE EXCEPTION 'Forbidden: Vivacity Academy account creation is staff-only'
      USING ERRCODE = '42501';
  END IF;

  IF v_name IS NULL OR length(v_name) < 2 THEN
    RAISE EXCEPTION 'Vivacity Academy account name is required'
      USING ERRCODE = '22023';
  END IF;

  IF v_tier NOT IN ('solo', 'team', 'elite') THEN
    RAISE EXCEPTION 'Invalid Vivacity Academy tier: %', v_tier
      USING ERRCODE = '22023';
  END IF;

  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'Vivacity Academy pilot end date must be in the future'
      USING ERRCODE = '22023';
  END IF;

  v_max_users := CASE v_tier WHEN 'solo' THEN 1 WHEN 'team' THEN 10 WHEN 'elite' THEN NULL END;
  v_plan_code := 'academy_' || v_tier;

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
    v_max_users,
    p_expires_at,
    false,
    false,
    false,
    jsonb_build_object(
      'academy_account_type', 'individual',
      'academy_solo', jsonb_build_object(
        'tier', v_tier,
        'status', 'pending_invitation',
        'plan_code', v_plan_code,
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
    'Vivacity Academy account provisioned without RTO client workflow',
    jsonb_build_object(
      'account_type', 'individual',
      'plan_code', v_plan_code,
      'tier', v_tier,
      'catalogue_scope', 'all_published_courses',
      'max_users', v_max_users,
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
    'plan_code', v_plan_code,
    'tier', v_tier,
    'catalogue_scope', 'all_published_courses',
    'max_users', v_max_users
  );
END;
$$;

COMMENT ON FUNCTION public.create_academy_solo_account(text, text, timestamptz, text) IS
  'Staff-only Vivacity Academy account provisioning (solo/team/elite tier). Reuses tenants as an isolation boundary but does not create an RTO profile, package instance, payment, or compliance workflow. MVP: no Stripe billing yet.';

REVOKE ALL ON FUNCTION public.create_academy_solo_account(text, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_academy_solo_account(text, text, timestamptz, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_academy_solo_account(text, text, timestamptz, text) TO authenticated, service_role;

-- Backfill: every existing Academy Solo tenant (metadata.academy_solo object
-- with no explicit tier) is, by construction, a 1-seat Solo pilot today —
-- stamp it with tier='solo' for forward compatibility with the tier model,
-- without changing its access/seat behaviour.
UPDATE public.tenants
SET metadata = jsonb_set(metadata, '{academy_solo,tier}', '"solo"'::jsonb, true)
WHERE jsonb_typeof(metadata -> 'academy_solo') = 'object'
  AND NOT (metadata -> 'academy_solo' ? 'tier');

NOTIFY pgrst, 'reload schema';

COMMIT;
