
-- ============================================================
-- 1. Membership Tier Capacity Config (static tier table)
-- ============================================================
CREATE TABLE public.membership_tier_capacity_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_key text NOT NULL UNIQUE,
  tier_label text NOT NULL,
  weekly_required_hours numeric(5,2) NOT NULL,
  package_ids bigint[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.membership_tier_capacity_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity staff can view tier config"
  ON public.membership_tier_capacity_config FOR SELECT
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "Super Admins can manage tier config"
  ON public.membership_tier_capacity_config FOR ALL
  USING (public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- Seed tier data mapped to existing membership packages
INSERT INTO public.membership_tier_capacity_config (tier_key, tier_label, weekly_required_hours, package_ids) VALUES
  ('amethyst', 'Amethyst', 0.10, ARRAY[1041]::bigint[]),
  ('gold',     'Gold',     0.40, ARRAY[1016, 1020]::bigint[]),
  ('ruby',     'Ruby',     0.91, ARRAY[8, 5]::bigint[]),
  ('sapphire', 'Sapphire', 1.55, ARRAY[1035, 1033]::bigint[]),
  ('diamond',  'Diamond',  2.32, ARRAY[1028, 1027]::bigint[]);

-- ============================================================
-- 2. Add columns to tenants
-- ============================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS assigned_consultant_user_id uuid REFERENCES public.users(user_uuid),
  ADD COLUMN IF NOT EXISTS consultant_assignment_method text DEFAULT 'auto' CHECK (consultant_assignment_method IN ('auto', 'manual')),
  ADD COLUMN IF NOT EXISTS client_onboarded_at timestamptz;

-- ============================================================
-- 3. Add allocation_paused to users
-- ============================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS allocation_paused boolean NOT NULL DEFAULT false;

-- ============================================================
-- 4. Consultant Assignment Audit Log
-- ============================================================
CREATE TABLE public.consultant_assignment_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  action text NOT NULL DEFAULT 'auto_assign' CHECK (action IN ('auto_assign', 'manual_override')),
  selected_consultant_user_id uuid REFERENCES public.users(user_uuid),
  previous_consultant_user_id uuid REFERENCES public.users(user_uuid),
  candidate_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  new_client_weekly_required numeric(6,3),
  onboarding_multiplier numeric(3,1),
  selected_projected_remaining numeric(6,3),
  over_capacity boolean NOT NULL DEFAULT false,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

ALTER TABLE public.consultant_assignment_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity staff can view assignment audit"
  ON public.consultant_assignment_audit_log FOR SELECT
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "System and Super Admins can insert assignment audit"
  ON public.consultant_assignment_audit_log FOR INSERT
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- ============================================================
-- 5. auto_assign_consultant() function
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_assign_consultant(p_tenant_id bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_tier_hours numeric;
  v_onboarding_multiplier numeric;
  v_client_weekly_required numeric;
  v_candidate RECORD;
  v_candidates jsonb := '[]'::jsonb;
  v_best_consultant_user_id uuid;
  v_best_projected_remaining numeric := -999999;
  v_best_active_clients bigint := 999999;
  v_best_recent_assignments bigint := 999999;
  v_over_capacity boolean := false;
  v_weeks_since_onboard numeric;
  v_consultant_load numeric;
  v_consultant_assignable numeric;
  v_projected_remaining numeric;
BEGIN
  -- Get tenant info
  SELECT t.id, t.package_id, t.created_at, t.client_onboarded_at, t.status
  INTO v_tenant
  FROM tenants t
  WHERE t.id = p_tenant_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant % not found', p_tenant_id;
  END IF;

  -- Determine tier hours from package
  SELECT mtcc.weekly_required_hours INTO v_tier_hours
  FROM membership_tier_capacity_config mtcc
  WHERE v_tenant.package_id = ANY(mtcc.package_ids);

  -- Default if no matching tier (non-membership package)
  IF v_tier_hours IS NULL THEN
    v_tier_hours := 0.40; -- default to Gold equivalent
  END IF;

  -- Calculate onboarding multiplier
  v_weeks_since_onboard := EXTRACT(EPOCH FROM (now() - COALESCE(v_tenant.client_onboarded_at, v_tenant.created_at))) / 604800.0;
  
  IF v_weeks_since_onboard <= 4 THEN
    v_onboarding_multiplier := 2.0;
  ELSIF v_weeks_since_onboard <= 8 THEN
    v_onboarding_multiplier := 1.5;
  ELSE
    v_onboarding_multiplier := 1.0;
  END IF;

  v_client_weekly_required := v_tier_hours * v_onboarding_multiplier;

  -- Iterate over eligible consultants
  FOR v_candidate IN
    SELECT 
      u.user_uuid,
      u.working_days,
      u.working_hours,
      -- Count active client assignments
      (SELECT count(*) FROM tenants ct 
       WHERE ct.assigned_consultant_user_id = u.user_uuid 
       AND ct.status = 'active') AS active_clients,
      -- Count assignments in last 30 days
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
    -- Calculate assignable hours dynamically
    DECLARE
      v_work_days int;
      v_start_hour numeric;
      v_end_hour numeric;
      v_daily_hours numeric;
    BEGIN
      v_work_days := jsonb_array_length(v_candidate.working_days);
      
      -- Parse working hours
      v_start_hour := EXTRACT(HOUR FROM (v_candidate.working_hours->>'start')::time)
                    + EXTRACT(MINUTE FROM (v_candidate.working_hours->>'start')::time) / 60.0;
      v_end_hour := EXTRACT(HOUR FROM (v_candidate.working_hours->>'end')::time)
                  + EXTRACT(MINUTE FROM (v_candidate.working_hours->>'end')::time) / 60.0;
      v_daily_hours := v_end_hour - v_start_hour;
      
      -- weekly_work_hours * 0.80 * 0.90
      v_consultant_assignable := v_work_days * v_daily_hours * 0.80 * 0.90;
    END;

    -- Calculate current load from all active assigned tenants
    SELECT COALESCE(SUM(
      mtcc2.weekly_required_hours * 
      CASE 
        WHEN EXTRACT(EPOCH FROM (now() - COALESCE(ct2.client_onboarded_at, ct2.created_at))) / 604800.0 <= 4 THEN 2.0
        WHEN EXTRACT(EPOCH FROM (now() - COALESCE(ct2.client_onboarded_at, ct2.created_at))) / 604800.0 <= 8 THEN 1.5
        ELSE 1.0
      END
    ), 0) INTO v_consultant_load
    FROM tenants ct2
    LEFT JOIN membership_tier_capacity_config mtcc2 ON ct2.package_id = ANY(mtcc2.package_ids)
    WHERE ct2.assigned_consultant_user_id = v_candidate.user_uuid
      AND ct2.status = 'active'
      AND ct2.id != p_tenant_id;

    v_projected_remaining := v_consultant_assignable - v_consultant_load - v_client_weekly_required;

    -- Add to candidate snapshot
    v_candidates := v_candidates || jsonb_build_object(
      'consultant_user_id', v_candidate.user_uuid,
      'weekly_assignable_hours', round(v_consultant_assignable, 3),
      'consultant_current_load', round(v_consultant_load, 3),
      'projected_remaining', round(v_projected_remaining, 3),
      'active_clients', v_candidate.active_clients,
      'recent_assignments', v_candidate.recent_assignments
    );

    -- Ranking: highest projected_remaining, then lowest active_clients, then lowest recent_assignments
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

  -- Check over-capacity
  IF v_best_projected_remaining < 0 THEN
    v_over_capacity := true;
  END IF;

  -- Update tenant with assigned consultant
  IF v_best_consultant_user_id IS NOT NULL THEN
    UPDATE tenants 
    SET assigned_consultant_user_id = v_best_consultant_user_id,
        consultant_assignment_method = 'auto',
        client_onboarded_at = COALESCE(client_onboarded_at, now())
    WHERE id = p_tenant_id;

    -- Also upsert into tenant_csc_assignments
    INSERT INTO tenant_csc_assignments (tenant_id, csc_user_id, role_label, is_primary, assigned_since)
    VALUES (p_tenant_id, v_best_consultant_user_id, 'Primary CSC', true, now())
    ON CONFLICT (tenant_id, csc_user_id) 
    DO UPDATE SET is_primary = true, updated_at = now();
  END IF;

  -- Insert audit log
  INSERT INTO consultant_assignment_audit_log (
    tenant_id, action, selected_consultant_user_id,
    candidate_snapshot, new_client_weekly_required, onboarding_multiplier,
    selected_projected_remaining, over_capacity
  ) VALUES (
    p_tenant_id, 'auto_assign', v_best_consultant_user_id,
    v_candidates, round(v_client_weekly_required, 3), v_onboarding_multiplier,
    round(v_best_projected_remaining, 3), v_over_capacity
  );

  RETURN v_best_consultant_user_id;
END;
$$;

-- ============================================================
-- 6. RPC wrapper for frontend
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_auto_assign_consultant(p_tenant_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result uuid;
BEGIN
  -- Verify caller is Vivacity staff
  IF NOT is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  v_result := auto_assign_consultant(p_tenant_id);
  
  RETURN jsonb_build_object(
    'success', true,
    'assigned_consultant_user_id', v_result
  );
END;
$$;
