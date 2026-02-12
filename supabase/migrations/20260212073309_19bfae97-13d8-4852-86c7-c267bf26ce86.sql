
-- ============================================================
-- 1. Add missing columns + indexes to consultant_capacity_audit_log
-- ============================================================
ALTER TABLE public.consultant_capacity_audit_log
  ADD COLUMN IF NOT EXISTS assignment_method text NOT NULL DEFAULT 'auto';

CREATE INDEX IF NOT EXISTS idx_cap_audit_tenant_client
  ON public.consultant_capacity_audit_log (tenant_id, client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cap_audit_tenant_consultant
  ON public.consultant_capacity_audit_log (tenant_id, selected_consultant_user_id, created_at DESC);

-- ============================================================
-- 2. Add tenant member read access to audit log
-- ============================================================
CREATE POLICY "Tenant members can read capacity audit"
  ON public.consultant_capacity_audit_log FOR SELECT
  USING (
    public.has_tenant_access_safe(tenant_id, auth.uid())
  );

-- Add delete policy for Vivacity only
CREATE POLICY "Vivacity SuperAdmin can delete capacity audit"
  ON public.consultant_capacity_audit_log FOR DELETE
  USING (public.is_super_admin_safe(auth.uid()));

-- ============================================================
-- 3. Updated auto_assign_consultant with excluded_reason in snapshot
-- ============================================================
DROP FUNCTION IF EXISTS public.auto_assign_consultant(bigint);

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
  v_days_since numeric;
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
  v_has_non_overloaded boolean := false;
  v_fallback_consultant_user_id uuid;
  v_fallback_projected numeric := -999999;
  v_excluded_reason text;
BEGIN
  SELECT t.id, t.package_id, t.created_at, t.client_onboarded_at, t.status
  INTO v_tenant
  FROM tenants t
  WHERE t.id = p_tenant_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant % not found', p_tenant_id;
  END IF;

  v_client_weekly_required := compute_client_weekly_required(p_tenant_id);

  v_days_since := EXTRACT(EPOCH FROM (now() - COALESCE(v_tenant.client_onboarded_at, v_tenant.created_at))) / 86400.0;
  IF v_days_since <= 28 THEN v_onboarding_multiplier := 2.0;
  ELSIF v_days_since <= 56 THEN v_onboarding_multiplier := 1.5;
  ELSE v_onboarding_multiplier := 1.0;
  END IF;

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
    v_excluded_reason := NULL;
    v_consultant_assignable := compute_consultant_weekly_capacity(v_candidate.user_uuid);
    v_consultant_load := compute_consultant_current_load(v_candidate.user_uuid);
    v_projected_remaining := v_consultant_assignable - v_consultant_load - v_client_weekly_required;

    -- Check exclusion reasons
    IF v_consultant_assignable = 0 THEN
      v_excluded_reason := 'zero_assignable_hours';
    ELSIF v_consultant_load > v_consultant_assignable THEN
      v_excluded_reason := 'already_over_capacity';
    END IF;

    -- Add to snapshot with exclusion info
    v_candidates := v_candidates || jsonb_build_object(
      'user_uuid', v_candidate.user_uuid,
      'weekly_assignable_hours', round(v_consultant_assignable, 2),
      'current_load', round(v_consultant_load, 2),
      'projected_remaining', round(v_projected_remaining, 2),
      'active_clients_count', v_candidate.active_clients,
      'recent_assignments', v_candidate.recent_assignments,
      'excluded_reason', COALESCE(v_excluded_reason, null)
    );

    -- Track fallback regardless
    IF v_projected_remaining > v_fallback_projected THEN
      v_fallback_consultant_user_id := v_candidate.user_uuid;
      v_fallback_projected := v_projected_remaining;
    END IF;

    -- Skip excluded candidates for primary pass
    IF v_excluded_reason IS NOT NULL THEN
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

  -- Fallback: all overloaded
  IF NOT v_has_non_overloaded AND v_fallback_consultant_user_id IS NOT NULL THEN
    v_best_consultant_user_id := v_fallback_consultant_user_id;
    v_best_projected_remaining := v_fallback_projected;
    v_over_capacity := true;
  END IF;

  IF v_best_projected_remaining < 0 THEN
    v_over_capacity := true;
  END IF;

  -- Apply assignment
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

    -- Overload alert
    IF v_over_capacity THEN
      INSERT INTO user_notifications (user_id, tenant_id, type, title, message, link, created_by)
      VALUES (
        v_best_consultant_user_id, p_tenant_id, 'capacity_alert',
        'Over-capacity Assignment',
        'You have been assigned a new client but are currently over capacity.',
        '/manage-tenants',
        auth.uid()
      );
    END IF;
  END IF;

  -- Write assignment audit log
  INSERT INTO consultant_assignment_audit_log (
    tenant_id, action, selected_consultant_user_id,
    candidate_snapshot, new_client_weekly_required, onboarding_multiplier,
    selected_projected_remaining, over_capacity
  ) VALUES (
    p_tenant_id, 'auto_assign', v_best_consultant_user_id,
    v_candidates, round(v_client_weekly_required, 2), v_onboarding_multiplier,
    round(v_best_projected_remaining, 2), v_over_capacity
  );

  -- Write capacity audit log
  INSERT INTO consultant_capacity_audit_log (
    tenant_id, client_id, selected_consultant_user_id,
    weekly_assignable_hours, consultant_current_load,
    projected_remaining, new_client_weekly_required,
    over_capacity, candidate_snapshot, assignment_method
  ) VALUES (
    p_tenant_id, p_tenant_id, v_best_consultant_user_id,
    CASE WHEN v_best_consultant_user_id IS NOT NULL
      THEN compute_consultant_weekly_capacity(v_best_consultant_user_id) ELSE 0 END,
    CASE WHEN v_best_consultant_user_id IS NOT NULL
      THEN compute_consultant_current_load(v_best_consultant_user_id) ELSE 0 END,
    round(v_best_projected_remaining, 2),
    round(v_client_weekly_required, 2),
    v_over_capacity, v_candidates, 'auto'
  );

  RETURN v_best_consultant_user_id;
END;
$$;

-- ============================================================
-- 4. Trigger on tenant insert for auto-assignment
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_auto_assign_consultant_on_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only auto-assign if no consultant already set and consultant_assignment_method is 'auto' or null
  IF NEW.assigned_consultant_user_id IS NULL
     AND COALESCE(NEW.consultant_assignment_method, 'auto') = 'auto'
     AND NEW.status = 'active'
  THEN
    PERFORM auto_assign_consultant(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_on_tenant_create ON public.tenants;
CREATE TRIGGER trg_auto_assign_on_tenant_create
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION trg_auto_assign_consultant_on_create();
