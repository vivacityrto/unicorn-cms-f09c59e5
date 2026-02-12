
-- ============================================================
-- 1. Add annual_included_hours to membership_tier_capacity_config
-- ============================================================
ALTER TABLE public.membership_tier_capacity_config
  ADD COLUMN IF NOT EXISTS annual_included_hours numeric(6,1) NOT NULL DEFAULT 0;

UPDATE public.membership_tier_capacity_config SET annual_included_hours = 0   WHERE tier_key = 'amethyst';
UPDATE public.membership_tier_capacity_config SET annual_included_hours = 14  WHERE tier_key = 'gold';
UPDATE public.membership_tier_capacity_config SET annual_included_hours = 35  WHERE tier_key = 'ruby';
UPDATE public.membership_tier_capacity_config SET annual_included_hours = 63  WHERE tier_key = 'sapphire';
UPDATE public.membership_tier_capacity_config SET annual_included_hours = 98  WHERE tier_key = 'diamond';

-- ============================================================
-- 2. compute_consultant_weekly_capacity(uuid) → numeric
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_consultant_weekly_capacity(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_work_days int;
  v_start_hour numeric;
  v_end_hour numeric;
  v_daily_hours numeric;
  v_user RECORD;
BEGIN
  SELECT working_days, working_hours, archived, disabled, allocation_paused
  INTO v_user
  FROM users
  WHERE user_uuid = p_user_id;

  IF v_user IS NULL OR v_user.archived OR v_user.disabled OR v_user.allocation_paused THEN
    RETURN 0;
  END IF;

  IF v_user.working_days IS NULL OR jsonb_array_length(v_user.working_days) = 0 THEN
    RETURN 0;
  END IF;

  v_work_days := jsonb_array_length(v_user.working_days);

  v_start_hour := EXTRACT(HOUR FROM (v_user.working_hours->>'start')::time)
                + EXTRACT(MINUTE FROM (v_user.working_hours->>'start')::time) / 60.0;
  v_end_hour := EXTRACT(HOUR FROM (v_user.working_hours->>'end')::time)
              + EXTRACT(MINUTE FROM (v_user.working_hours->>'end')::time) / 60.0;
  v_daily_hours := v_end_hour - v_start_hour;

  IF v_daily_hours <= 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND(v_work_days * v_daily_hours * 0.80 * 0.90, 3);
END;
$$;

-- ============================================================
-- 3. compute_client_weekly_required(bigint) → numeric
--    Uses tenant_id (bigint) per schema convention
-- ============================================================
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
  SELECT package_id, client_onboarded_at, created_at, status
  INTO v_tenant
  FROM tenants
  WHERE id = p_tenant_id;

  IF v_tenant IS NULL OR v_tenant.status != 'active' THEN
    RETURN 0;
  END IF;

  SELECT weekly_required_hours INTO v_tier_hours
  FROM membership_tier_capacity_config
  WHERE v_tenant.package_id = ANY(package_ids);

  IF v_tier_hours IS NULL THEN
    v_tier_hours := 0.40; -- default Gold
  END IF;

  v_weeks_since := EXTRACT(EPOCH FROM (now() - COALESCE(v_tenant.client_onboarded_at, v_tenant.created_at))) / 604800.0;

  IF v_weeks_since <= 4 THEN
    v_multiplier := 2.0;
  ELSIF v_weeks_since <= 8 THEN
    v_multiplier := 1.5;
  ELSE
    v_multiplier := 1.0;
  END IF;

  RETURN ROUND(v_tier_hours * v_multiplier, 3);
END;
$$;

-- ============================================================
-- 4. compute_consultant_current_load(uuid) → numeric
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_consultant_current_load(p_user_id uuid)
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
    WHERE assigned_consultant_user_id = p_user_id
      AND status = 'active'
  LOOP
    v_total := v_total + compute_client_weekly_required(v_tenant.id);
  END LOOP;

  RETURN ROUND(v_total, 3);
END;
$$;

-- ============================================================
-- 5. compute_membership_usage(bigint) → jsonb
--    Uses time_entries for hours tracking
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_membership_usage(p_tenant_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_annual_hours numeric;
  v_membership_start date;
  v_year_start timestamptz;
  v_year_end timestamptz;
  v_hours_used numeric;
  v_remaining numeric;
  v_pct numeric;
BEGIN
  SELECT t.package_id, t.client_onboarded_at, t.created_at
  INTO v_tenant
  FROM tenants t
  WHERE t.id = p_tenant_id;

  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('error', 'tenant_not_found');
  END IF;

  -- Get annual included hours from tier
  SELECT annual_included_hours INTO v_annual_hours
  FROM membership_tier_capacity_config
  WHERE v_tenant.package_id = ANY(package_ids);

  IF v_annual_hours IS NULL THEN
    v_annual_hours := 0;
  END IF;

  -- Determine membership year boundaries based on onboard date
  v_membership_start := COALESCE(v_tenant.client_onboarded_at, v_tenant.created_at)::date;
  
  -- Find the current membership year start
  IF (v_membership_start + ((EXTRACT(YEAR FROM now())::int - EXTRACT(YEAR FROM v_membership_start)::int) * interval '1 year')) > now() THEN
    v_year_start := (v_membership_start + ((EXTRACT(YEAR FROM now())::int - EXTRACT(YEAR FROM v_membership_start)::int - 1) * interval '1 year'))::timestamptz;
  ELSE
    v_year_start := (v_membership_start + ((EXTRACT(YEAR FROM now())::int - EXTRACT(YEAR FROM v_membership_start)::int) * interval '1 year'))::timestamptz;
  END IF;
  v_year_end := v_year_start + interval '1 year';

  -- Sum hours from time_entries for this tenant in the current membership year
  SELECT COALESCE(SUM(duration_minutes / 60.0), 0) INTO v_hours_used
  FROM time_entries
  WHERE client_id = p_tenant_id
    AND start_at >= v_year_start
    AND start_at < v_year_end
    AND is_billable = true;

  v_remaining := GREATEST(v_annual_hours - v_hours_used, 0);
  v_pct := CASE WHEN v_annual_hours > 0 THEN ROUND((v_hours_used / v_annual_hours) * 100, 1) ELSE 0 END;

  RETURN jsonb_build_object(
    'included_hours_annual', v_annual_hours,
    'hours_used_ytd', ROUND(v_hours_used, 2),
    'hours_remaining', ROUND(v_remaining, 2),
    'percent_utilised', v_pct,
    'membership_year_start', v_year_start,
    'membership_year_end', v_year_end
  );
END;
$$;

-- ============================================================
-- 6. Consultant Capacity Audit Log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.consultant_capacity_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint REFERENCES public.tenants(id),
  client_id bigint REFERENCES public.tenants(id),
  selected_consultant_user_id uuid REFERENCES public.users(user_uuid),
  weekly_assignable_hours numeric(6,3),
  consultant_current_load numeric(6,3),
  projected_remaining numeric(6,3),
  new_client_weekly_required numeric(6,3),
  over_capacity boolean NOT NULL DEFAULT false,
  candidate_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

ALTER TABLE public.consultant_capacity_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity staff can view capacity audit"
  ON public.consultant_capacity_audit_log FOR SELECT
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "System can insert capacity audit"
  ON public.consultant_capacity_audit_log FOR INSERT
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- ============================================================
-- 7. Updated auto_assign_consultant with overload guardrail
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_assign_consultant(p_tenant_id bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_client_weekly_required numeric;
  v_onboarding_multiplier numeric;
  v_weeks_since_onboard numeric;
  v_candidate RECORD;
  v_candidates jsonb := '[]'::jsonb;
  v_best_consultant_user_id uuid;
  v_best_projected_remaining numeric := -999999;
  v_best_active_clients bigint := 999999;
  v_best_recent_assignments bigint := 999999;
  v_over_capacity boolean := false;
  v_consultant_assignable numeric;
  v_consultant_load numeric;
  v_projected_remaining numeric;
  -- Overload tracking
  v_has_non_overloaded boolean := false;
  v_fallback_consultant_user_id uuid;
  v_fallback_projected numeric := -999999;
BEGIN
  -- Get tenant info
  SELECT t.id, t.package_id, t.created_at, t.client_onboarded_at, t.status
  INTO v_tenant
  FROM tenants t
  WHERE t.id = p_tenant_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant % not found', p_tenant_id;
  END IF;

  -- Use the compute function for client weekly required
  v_client_weekly_required := compute_client_weekly_required(p_tenant_id);

  -- Calculate onboarding multiplier for audit logging
  v_weeks_since_onboard := EXTRACT(EPOCH FROM (now() - COALESCE(v_tenant.client_onboarded_at, v_tenant.created_at))) / 604800.0;
  IF v_weeks_since_onboard <= 4 THEN v_onboarding_multiplier := 2.0;
  ELSIF v_weeks_since_onboard <= 8 THEN v_onboarding_multiplier := 1.5;
  ELSE v_onboarding_multiplier := 1.0;
  END IF;

  -- Iterate eligible consultants
  FOR v_candidate IN
    SELECT 
      u.user_uuid,
      (SELECT count(*) FROM tenants ct 
       WHERE ct.assigned_consultant_user_id = u.user_uuid 
       AND ct.status = 'active') AS active_clients,
      (SELECT count(*) FROM consultant_assignment_audit_log cal 
       WHERE cal.selected_consultant_user_id = u.user_uuid 
       AND cal.created_at > now() - interval '30 days') AS recent_assignments
    FROM users u
    WHERE u.is_vivacity_internal = true
      AND u.disabled = false
      AND u.archived = false
      AND u.allocation_paused = false
      AND u.working_days IS NOT NULL
      AND jsonb_array_length(u.working_days) > 0
  LOOP
    -- Use compute functions
    v_consultant_assignable := compute_consultant_weekly_capacity(v_candidate.user_uuid);
    v_consultant_load := compute_consultant_current_load(v_candidate.user_uuid);
    v_projected_remaining := v_consultant_assignable - v_consultant_load - v_client_weekly_required;

    -- Add to snapshot
    v_candidates := v_candidates || jsonb_build_object(
      'consultant_user_id', v_candidate.user_uuid,
      'weekly_assignable_hours', round(v_consultant_assignable, 3),
      'consultant_current_load', round(v_consultant_load, 3),
      'projected_remaining', round(v_projected_remaining, 3),
      'active_clients', v_candidate.active_clients,
      'recent_assignments', v_candidate.recent_assignments
    );

    -- Track fallback (least overloaded) regardless
    IF v_projected_remaining > v_fallback_projected THEN
      v_fallback_consultant_user_id := v_candidate.user_uuid;
      v_fallback_projected := v_projected_remaining;
    END IF;

    -- OVERLOAD GUARDRAIL: skip if already overloaded before this client
    IF v_consultant_load > v_consultant_assignable THEN
      -- Already over capacity, log exclusion but track as fallback
      CONTINUE;
    END IF;

    v_has_non_overloaded := true;

    -- Ranking: highest projected_remaining, then lowest active clients, then fewest recent
    IF v_projected_remaining > v_best_projected_remaining
       OR (v_projected_remaining = v_best_projected_remaining AND v_candidate.active_clients < v_best_active_clients)
       OR (v_projected_remaining = v_best_projected_remaining AND v_candidate.active_clients = v_best_active_clients AND v_candidate.recent_assignments < v_best_recent_assignments)
    THEN
      v_best_consultant_user_id := v_candidate.user_uuid;
      v_best_projected_remaining := v_projected_remaining;
      v_best_active_clients := v_candidate.active_clients;
      v_best_recent_assignments := v_candidate.recent_assignments;
    END IF;
  END LOOP;

  -- If all consultants were overloaded, use fallback
  IF NOT v_has_non_overloaded AND v_fallback_consultant_user_id IS NOT NULL THEN
    v_best_consultant_user_id := v_fallback_consultant_user_id;
    v_best_projected_remaining := v_fallback_projected;
    v_over_capacity := true;
  END IF;

  -- Check if selected is still over capacity
  IF v_best_projected_remaining < 0 THEN
    v_over_capacity := true;
  END IF;

  -- Update tenant
  IF v_best_consultant_user_id IS NOT NULL THEN
    UPDATE tenants 
    SET assigned_consultant_user_id = v_best_consultant_user_id,
        consultant_assignment_method = 'auto',
        client_onboarded_at = COALESCE(client_onboarded_at, now())
    WHERE id = p_tenant_id;

    INSERT INTO tenant_csc_assignments (tenant_id, csc_user_id, role_label, is_primary, assigned_since)
    VALUES (p_tenant_id, v_best_consultant_user_id, 'Primary CSC', true, now())
    ON CONFLICT (tenant_id, csc_user_id) 
    DO UPDATE SET is_primary = true, updated_at = now();

    -- Fire overload alerts
    IF v_over_capacity THEN
      INSERT INTO user_notifications (user_id, tenant_id, type, title, message, link, created_by)
      VALUES (
        v_best_consultant_user_id, p_tenant_id, 'capacity_alert',
        'Over-capacity Assignment',
        'You have been assigned a new client but are currently over capacity. Please review your workload.',
        '/manage-tenants',
        auth.uid()
      );
    END IF;
  END IF;

  -- Insert assignment audit log
  INSERT INTO consultant_assignment_audit_log (
    tenant_id, action, selected_consultant_user_id,
    candidate_snapshot, new_client_weekly_required, onboarding_multiplier,
    selected_projected_remaining, over_capacity
  ) VALUES (
    p_tenant_id, 'auto_assign', v_best_consultant_user_id,
    v_candidates, round(v_client_weekly_required, 3), v_onboarding_multiplier,
    round(v_best_projected_remaining, 3), v_over_capacity
  );

  -- Insert capacity audit log
  INSERT INTO consultant_capacity_audit_log (
    tenant_id, client_id, selected_consultant_user_id,
    weekly_assignable_hours, consultant_current_load,
    projected_remaining, new_client_weekly_required,
    over_capacity, candidate_snapshot
  ) VALUES (
    p_tenant_id, p_tenant_id, v_best_consultant_user_id,
    CASE WHEN v_best_consultant_user_id IS NOT NULL 
      THEN compute_consultant_weekly_capacity(v_best_consultant_user_id) ELSE 0 END,
    CASE WHEN v_best_consultant_user_id IS NOT NULL 
      THEN compute_consultant_current_load(v_best_consultant_user_id) ELSE 0 END,
    round(v_best_projected_remaining, 3),
    round(v_client_weekly_required, 3),
    v_over_capacity, v_candidates
  );

  RETURN v_best_consultant_user_id;
END;
$$;

-- ============================================================
-- 8. RPC: get_consultant_capacity_overview (for dashboard)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_get_consultant_capacity_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_consultant RECORD;
  v_assignable numeric;
  v_load numeric;
  v_remaining numeric;
  v_active_clients bigint;
BEGIN
  IF NOT is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR v_consultant IN
    SELECT user_uuid, first_name, last_name, job_title
    FROM users
    WHERE is_vivacity_internal = true
      AND disabled = false
      AND archived = false
    ORDER BY first_name
  LOOP
    v_assignable := compute_consultant_weekly_capacity(v_consultant.user_uuid);
    v_load := compute_consultant_current_load(v_consultant.user_uuid);
    v_remaining := v_assignable - v_load;

    SELECT count(*) INTO v_active_clients
    FROM tenants
    WHERE assigned_consultant_user_id = v_consultant.user_uuid
      AND status = 'active';

    v_result := v_result || jsonb_build_object(
      'user_uuid', v_consultant.user_uuid,
      'first_name', v_consultant.first_name,
      'last_name', v_consultant.last_name,
      'job_title', v_consultant.job_title,
      'weekly_assignable_hours', round(v_assignable, 2),
      'current_load', round(v_load, 2),
      'remaining_capacity', round(v_remaining, 2),
      'active_clients', v_active_clients,
      'overload', v_load > v_assignable
    );
  END LOOP;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 9. RPC: get_membership_usage (for client profile)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_get_membership_usage(p_tenant_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN compute_membership_usage(p_tenant_id);
END;
$$;

-- ============================================================
-- 10. Utilisation alert trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_membership_utilisation_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage jsonb;
  v_pct numeric;
  v_tenant_id bigint;
  v_consultant_id uuid;
  v_dedupe text;
BEGIN
  v_tenant_id := NEW.client_id;
  
  -- Get usage stats
  v_usage := compute_membership_usage(v_tenant_id);
  v_pct := (v_usage->>'percent_utilised')::numeric;

  -- Get assigned consultant
  SELECT assigned_consultant_user_id INTO v_consultant_id
  FROM tenants WHERE id = v_tenant_id;

  IF v_consultant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 75% threshold
  IF v_pct >= 75 AND v_pct < 90 THEN
    v_dedupe := 'utilisation_75_' || v_tenant_id || '_' || to_char(now(), 'YYYY-MM');
    INSERT INTO user_notifications (user_id, tenant_id, type, title, message, link, dedupe_key, created_by)
    VALUES (
      v_consultant_id, v_tenant_id, 'utilisation_warning',
      'Membership at 75% utilisation',
      'Client has used 75% of their annual included hours.',
      '/tenant/' || v_tenant_id,
      v_dedupe, NEW.user_id
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  -- 90% threshold
  IF v_pct >= 90 THEN
    v_dedupe := 'utilisation_90_' || v_tenant_id || '_' || to_char(now(), 'YYYY-MM');
    INSERT INTO user_notifications (user_id, tenant_id, type, title, message, link, dedupe_key, created_by)
    VALUES (
      v_consultant_id, v_tenant_id, 'utilisation_critical',
      'Membership at 90% utilisation',
      'Client is approaching their annual included hours limit.',
      '/tenant/' || v_tenant_id,
      v_dedupe, NEW.user_id
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on time_entries for utilisation alerts
DROP TRIGGER IF EXISTS trg_check_membership_utilisation ON time_entries;
CREATE TRIGGER trg_check_membership_utilisation
  AFTER INSERT ON time_entries
  FOR EACH ROW
  WHEN (NEW.is_billable = true)
  EXECUTE FUNCTION check_membership_utilisation_alerts();
