
-- ============================================================
-- 1. Drop and recreate compute_client_weekly_required
--    Uses bigint to match tenants.id
-- ============================================================
DROP FUNCTION IF EXISTS public.compute_client_weekly_required(bigint);

CREATE OR REPLACE FUNCTION public.compute_client_weekly_required(p_tenant_id bigint)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_tier_hours numeric;
  v_weeks_since numeric;
  v_multiplier numeric;
BEGIN
  SELECT id, package_id, client_onboarded_at, created_at, status
  INTO v_tenant
  FROM tenants
  WHERE id = p_tenant_id;

  IF v_tenant IS NULL OR v_tenant.status != 'active' THEN
    RETURN 0;
  END IF;

  -- Resolve tier weekly hours via global config (package_ids array match)
  SELECT weekly_required_hours INTO v_tier_hours
  FROM membership_tier_capacity_config
  WHERE v_tenant.package_id = ANY(package_ids);

  -- If no match found, return 0
  IF v_tier_hours IS NULL THEN
    RETURN 0;
  END IF;

  -- Onboarding multiplier based on days since onboarding
  v_weeks_since := EXTRACT(EPOCH FROM (now() - COALESCE(v_tenant.client_onboarded_at, v_tenant.created_at))) / 86400.0;

  IF v_weeks_since <= 28 THEN
    v_multiplier := 2.0;
  ELSIF v_weeks_since <= 56 THEN
    v_multiplier := 1.5;
  ELSE
    v_multiplier := 1.0;
  END IF;

  RETURN ROUND(v_tier_hours * v_multiplier, 2);
END;
$$;

-- ============================================================
-- 2. Diagnostics view: flags missing tier configs
-- ============================================================
CREATE OR REPLACE VIEW public.vw_client_capacity_diagnostics
WITH (security_invoker = true)
AS
SELECT
  t.id AS tenant_id,
  t.id AS client_id,
  t.name AS client_name,
  t.status,
  t.package_id,
  mc.tier_label AS tier_name,
  (mc.id IS NOT NULL) AS has_tier_config,
  COALESCE(mc.weekly_required_hours, 0) AS base_weekly_required,
  CASE
    WHEN t.status != 'active' THEN 0
    WHEN EXTRACT(EPOCH FROM (now() - COALESCE(t.client_onboarded_at, t.created_at))) / 86400.0 <= 28 THEN 2.0
    WHEN EXTRACT(EPOCH FROM (now() - COALESCE(t.client_onboarded_at, t.created_at))) / 86400.0 <= 56 THEN 1.5
    ELSE 1.0
  END AS onboarding_multiplier,
  compute_client_weekly_required(t.id) AS computed_weekly_required
FROM tenants t
LEFT JOIN membership_tier_capacity_config mc
  ON t.package_id = ANY(mc.package_ids);

-- ============================================================
-- 3. Drop and recreate compute_consultant_current_load
-- ============================================================
DROP FUNCTION IF EXISTS public.compute_consultant_current_load(uuid);

CREATE OR REPLACE FUNCTION public.compute_consultant_current_load(p_user_uuid uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric := 0;
  v_tenant RECORD;
BEGIN
  FOR v_tenant IN
    SELECT id FROM tenants
    WHERE assigned_consultant_user_id = p_user_uuid
      AND status = 'active'
  LOOP
    v_total := v_total + compute_client_weekly_required(v_tenant.id);
  END LOOP;

  RETURN ROUND(v_total, 2);
END;
$$;

-- ============================================================
-- 4. Consultant load dashboard view
-- ============================================================
CREATE OR REPLACE VIEW public.vw_consultant_load
WITH (security_invoker = true)
AS
SELECT
  vc.tenant_id,
  vc.user_uuid,
  vc.weekly_assignable_hours,
  public.compute_consultant_current_load(vc.user_uuid) AS current_load,
  vc.weekly_assignable_hours - public.compute_consultant_current_load(vc.user_uuid) AS remaining_capacity,
  (SELECT count(*) FROM tenants ct
   WHERE ct.assigned_consultant_user_id = vc.user_uuid
     AND ct.status = 'active') AS active_clients_count
FROM vw_consultant_capacity vc
WHERE vc.weekly_assignable_hours > 0;
