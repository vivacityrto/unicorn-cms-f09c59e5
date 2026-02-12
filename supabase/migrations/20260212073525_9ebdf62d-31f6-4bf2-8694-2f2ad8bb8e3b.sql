
-- ============================================================
-- Server-side notification triggers for capacity alerts
-- Uses dedupe_key in user_notifications to prevent spam
-- ============================================================

-- 1. Function: Check membership usage and fire notifications at 75% and 90%
CREATE OR REPLACE FUNCTION public.fn_check_membership_usage_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage jsonb;
  v_pct numeric;
  v_annual numeric;
  v_tenant_id bigint;
  v_consultant_uuid uuid;
  v_year_start text;
  v_dedupe_75 text;
  v_dedupe_90 text;
BEGIN
  -- Get tenant info from the time entry
  v_tenant_id := NEW.tenant_id;
  
  -- Get assigned consultant
  SELECT assigned_consultant_user_id INTO v_consultant_uuid
  FROM tenants WHERE id = v_tenant_id;
  
  IF v_consultant_uuid IS NULL THEN RETURN NEW; END IF;

  -- Compute usage
  v_usage := compute_membership_usage(v_tenant_id);
  v_pct := (v_usage->>'percent_utilised')::numeric;
  v_annual := (v_usage->>'included_hours_annual')::numeric;
  v_year_start := v_usage->>'membership_start_date';

  IF v_annual IS NULL OR v_annual = 0 OR v_pct IS NULL THEN RETURN NEW; END IF;

  v_dedupe_75 := 'membership_75_' || v_tenant_id || '_' || v_year_start;
  v_dedupe_90 := 'membership_90_' || v_tenant_id || '_' || v_year_start;

  -- 75% threshold
  IF v_pct >= 75 AND v_pct < 90 THEN
    INSERT INTO user_notifications (user_id, tenant_id, type, title, message, link, dedupe_key)
    VALUES (
      v_consultant_uuid, v_tenant_id, 'capacity_alert',
      'Membership 75% Used',
      'Client has used 75% of included annual hours.',
      '/tenant/' || v_tenant_id,
      v_dedupe_75
    )
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  -- 90% threshold
  IF v_pct >= 90 THEN
    INSERT INTO user_notifications (user_id, tenant_id, type, title, message, link, dedupe_key)
    VALUES (
      v_consultant_uuid, v_tenant_id, 'capacity_alert',
      'Membership 90% Used',
      'Client has used 90% of included annual hours. Review for potential overage.',
      '/tenant/' || v_tenant_id,
      v_dedupe_90
    )
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Create unique partial index on dedupe_key for ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notifications_dedupe_key
  ON public.user_notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Attach trigger to time_entries
DROP TRIGGER IF EXISTS trg_check_membership_usage ON public.time_entries;
CREATE TRIGGER trg_check_membership_usage
  AFTER INSERT ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION fn_check_membership_usage_alerts();

-- 2. Function: Check consultant overload after assignment changes
CREATE OR REPLACE FUNCTION public.fn_check_consultant_overload_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consultant_uuid uuid;
  v_assignable numeric;
  v_load numeric;
  v_dedupe text;
BEGIN
  v_consultant_uuid := NEW.assigned_consultant_user_id;
  IF v_consultant_uuid IS NULL THEN RETURN NEW; END IF;

  v_assignable := compute_consultant_weekly_capacity(v_consultant_uuid);
  v_load := compute_consultant_current_load(v_consultant_uuid);

  IF v_load > v_assignable AND v_assignable > 0 THEN
    v_dedupe := 'overload_' || v_consultant_uuid || '_' || to_char(now(), 'YYYY-MM-DD');
    
    INSERT INTO user_notifications (user_id, tenant_id, type, title, message, link, dedupe_key)
    VALUES (
      v_consultant_uuid, NEW.id, 'capacity_alert',
      'Over Capacity',
      'Your current load (' || round(v_load, 1) || 'h) exceeds your weekly capacity (' || round(v_assignable, 1) || 'h).',
      '/membership-dashboard',
      v_dedupe
    )
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach to tenants update (when consultant changes)
DROP TRIGGER IF EXISTS trg_check_overload_on_assignment ON public.tenants;
CREATE TRIGGER trg_check_overload_on_assignment
  AFTER UPDATE OF assigned_consultant_user_id ON public.tenants
  FOR EACH ROW
  WHEN (NEW.assigned_consultant_user_id IS DISTINCT FROM OLD.assigned_consultant_user_id)
  EXECUTE FUNCTION fn_check_consultant_overload_alert();

-- 3. RPC to get consultant's assigned clients with capacity details
CREATE OR REPLACE FUNCTION public.rpc_get_consultant_clients(p_consultant_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_client RECORD;
  v_weekly numeric;
  v_usage jsonb;
  v_days numeric;
  v_multiplier numeric;
BEGIN
  IF NOT is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR v_client IN
    SELECT t.id, t.name, t.status, t.package_id, t.client_onboarded_at, t.created_at,
           p.name AS tier_name
    FROM tenants t
    LEFT JOIN packages p ON p.id = t.package_id
    WHERE t.assigned_consultant_user_id = p_consultant_uuid
      AND t.status = 'active'
    ORDER BY t.name
  LOOP
    v_weekly := compute_client_weekly_required(v_client.id);
    v_usage := compute_membership_usage(v_client.id);
    
    v_days := EXTRACT(EPOCH FROM (now() - COALESCE(v_client.client_onboarded_at, v_client.created_at))) / 86400.0;
    IF v_days <= 28 THEN v_multiplier := 2.0;
    ELSIF v_days <= 56 THEN v_multiplier := 1.5;
    ELSE v_multiplier := 1.0;
    END IF;

    v_result := v_result || jsonb_build_object(
      'tenant_id', v_client.id,
      'name', v_client.name,
      'tier_name', COALESCE(v_client.tier_name, 'Unknown'),
      'weekly_required', round(v_weekly, 2),
      'onboarding_multiplier', v_multiplier,
      'percent_utilised', COALESCE((v_usage->>'percent_utilised')::numeric, 0)
    );
  END LOOP;

  RETURN v_result;
END;
$$;
