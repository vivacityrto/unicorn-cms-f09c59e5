
-- ============================================================
-- TENANT-LEVEL TIME ALLOCATION ENGINE
-- Phase 1: Package billing flags
-- Phase 2: Allocation tables
-- Phase 3: RLS
-- Phase 4: Allocation engine + views
-- ============================================================

-- ─── 1.1 Package billing columns ────────────────────────────
ALTER TABLE public.package_instances
  ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'billable',
  ADD COLUMN IF NOT EXISTS billing_category text NULL,
  ADD COLUMN IF NOT EXISTS included_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.package_instances.billing_type IS 'billable | non_billable';
COMMENT ON COLUMN public.package_instances.billing_category IS 'membership_rto | membership_cricos | other';
COMMENT ON COLUMN public.package_instances.included_minutes IS 'Included allowance in minutes (from tier)';

-- Validation trigger for billing_type and billing_category
CREATE OR REPLACE FUNCTION public.fn_validate_billing_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.billing_type NOT IN ('billable', 'non_billable') THEN
    RAISE EXCEPTION 'billing_type must be billable or non_billable';
  END IF;
  IF NEW.billing_category IS NOT NULL
     AND NEW.billing_category NOT IN ('membership_rto', 'membership_cricos', 'other') THEN
    RAISE EXCEPTION 'billing_category must be membership_rto, membership_cricos, other, or null';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_billing ON public.package_instances;
CREATE TRIGGER trg_validate_billing
  BEFORE INSERT OR UPDATE OF billing_type, billing_category
  ON public.package_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_billing_fields();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pi_tenant_active
  ON public.package_instances (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_pi_tenant_billing
  ON public.package_instances (tenant_id, billing_type, billing_category, is_active);

-- ─── 1.2 Backfill existing packages ────────────────────────
-- Sync is_active from is_complete (inverted)
UPDATE public.package_instances
SET is_active = NOT is_complete;

-- KickStart packages → non_billable
UPDATE public.package_instances pi
SET billing_type = 'non_billable',
    billing_category = NULL,
    included_minutes = 0
FROM public.packages p
WHERE pi.package_id = p.id
  AND (p.slug LIKE '%ks%' OR p.name LIKE 'KS%' OR p.name LIKE 'KickStart%');

-- Membership RTO packages (slug ends with 'r' pattern: M-*R)
UPDATE public.package_instances pi
SET billing_type = 'billable',
    billing_category = 'membership_rto',
    included_minutes = COALESCE(pi.hours_included, p.total_hours, 0) * 60
FROM public.packages p
WHERE pi.package_id = p.id
  AND p.name LIKE 'M-%'
  AND (p.slug LIKE '%-r' OR p.slug LIKE '%-gr' OR p.slug LIKE '%-rr' 
       OR p.slug LIKE '%-dr' OR p.slug LIKE '%-sar' OR p.slug LIKE '%-bc');

-- Membership CRICOS packages (slug ends with 'c' pattern: M-*C)
UPDATE public.package_instances pi
SET billing_type = 'billable',
    billing_category = 'membership_cricos',
    included_minutes = COALESCE(pi.hours_included, p.total_hours, 0) * 60
FROM public.packages p
WHERE pi.package_id = p.id
  AND p.name LIKE 'M-%'
  AND (p.slug LIKE '%-rc' OR p.slug LIKE '%-gc' OR p.slug LIKE '%-dc' 
       OR p.slug LIKE '%-sac' OR p.slug LIKE '%-bc');

-- Remaining M- packages without clear suffix → default to membership_rto
UPDATE public.package_instances pi
SET billing_type = 'billable',
    billing_category = 'membership_rto',
    included_minutes = COALESCE(pi.hours_included, p.total_hours, 0) * 60
FROM public.packages p
WHERE pi.package_id = p.id
  AND p.name LIKE 'M-%'
  AND pi.billing_category IS NULL;

-- GTO packages
UPDATE public.package_instances pi
SET billing_type = 'billable',
    billing_category = 'other',
    included_minutes = COALESCE(pi.hours_included, p.total_hours, 0) * 60
FROM public.packages p
WHERE pi.package_id = p.id
  AND (p.name LIKE 'M-GTO%');

-- Non-membership, non-KS packages default to 'other' billable
UPDATE public.package_instances pi
SET billing_type = 'billable',
    billing_category = 'other'
FROM public.packages p
WHERE pi.package_id = p.id
  AND pi.billing_category IS NULL
  AND pi.billing_type = 'billable';


-- ─── 2.1 Add scope_tag to time_entries ──────────────────────
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS scope_tag text NOT NULL DEFAULT 'both';

-- Validation trigger for scope_tag
CREATE OR REPLACE FUNCTION public.fn_validate_scope_tag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.scope_tag NOT IN ('both', 'rto', 'cricos') THEN
    RAISE EXCEPTION 'scope_tag must be both, rto, or cricos';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_scope_tag ON public.time_entries;
CREATE TRIGGER trg_validate_scope_tag
  BEFORE INSERT OR UPDATE OF scope_tag
  ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_scope_tag();


-- ─── 2.2 time_entry_allocations ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_entry_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  tenant_id integer NOT NULL,
  package_instance_id bigint NOT NULL,
  allocated_minutes integer NOT NULL CHECK (allocated_minutes >= 0),
  allocation_reason text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (time_entry_id, package_instance_id)
);

-- Validation trigger for allocation_reason
CREATE OR REPLACE FUNCTION public.fn_validate_allocation_reason()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.allocation_reason NOT IN ('auto', 'override', 'reallocate') THEN
    RAISE EXCEPTION 'allocation_reason must be auto, override, or reallocate';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_allocation_reason ON public.time_entry_allocations;
CREATE TRIGGER trg_validate_allocation_reason
  BEFORE INSERT OR UPDATE OF allocation_reason
  ON public.time_entry_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_allocation_reason();

CREATE INDEX IF NOT EXISTS idx_tea_tenant_package
  ON public.time_entry_allocations (tenant_id, package_instance_id);
CREATE INDEX IF NOT EXISTS idx_tea_tenant_entry
  ON public.time_entry_allocations (tenant_id, time_entry_id);

ALTER TABLE public.time_entry_allocations ENABLE ROW LEVEL SECURITY;


-- ─── 2.3 membership_allocation_groups ───────────────────────
CREATE TABLE IF NOT EXISTS public.membership_allocation_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL UNIQUE,
  mode text NOT NULL DEFAULT 'weighted',
  rto_weight numeric NOT NULL DEFAULT 0.5,
  cricos_weight numeric NOT NULL DEFAULT 0.5,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Weights must sum to 1
CREATE OR REPLACE FUNCTION public.fn_validate_weights()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.mode NOT IN ('equal_split', 'weighted') THEN
    RAISE EXCEPTION 'mode must be equal_split or weighted';
  END IF;
  IF abs((NEW.rto_weight + NEW.cricos_weight) - 1.0) > 0.001 THEN
    RAISE EXCEPTION 'rto_weight + cricos_weight must equal 1.0';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_weights ON public.membership_allocation_groups;
CREATE TRIGGER trg_validate_weights
  BEFORE INSERT OR UPDATE
  ON public.membership_allocation_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_weights();

ALTER TABLE public.membership_allocation_groups ENABLE ROW LEVEL SECURITY;


-- ─── 3. RLS Policies ───────────────────────────────────────

-- time_entry_allocations
CREATE POLICY "tea_select_vivacity" ON public.time_entry_allocations
  FOR SELECT USING (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "tea_select_tenant" ON public.time_entry_allocations
  FOR SELECT USING (public.has_tenant_access_safe(tenant_id::bigint, auth.uid()));

CREATE POLICY "tea_insert_vivacity" ON public.time_entry_allocations
  FOR INSERT WITH CHECK (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "tea_delete_vivacity" ON public.time_entry_allocations
  FOR DELETE USING (public.is_vivacity_internal_safe(auth.uid()));

-- membership_allocation_groups
CREATE POLICY "mag_select_vivacity" ON public.membership_allocation_groups
  FOR SELECT USING (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "mag_select_tenant" ON public.membership_allocation_groups
  FOR SELECT USING (public.has_tenant_access_safe(tenant_id::bigint, auth.uid()));

CREATE POLICY "mag_insert_vivacity" ON public.membership_allocation_groups
  FOR INSERT WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "mag_update_vivacity" ON public.membership_allocation_groups
  FOR UPDATE USING (public.is_vivacity_team_safe(auth.uid()));


-- ─── 4.1 Helper: get active membership packages ────────────
CREATE OR REPLACE FUNCTION public.get_active_membership_packages(p_tenant_id integer)
RETURNS TABLE (
  rto_package_instance_id bigint,
  cricos_package_instance_id bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    (SELECT id FROM package_instances
     WHERE tenant_id = p_tenant_id
       AND is_active = true
       AND billing_type = 'billable'
       AND billing_category = 'membership_rto'
     ORDER BY start_date DESC
     LIMIT 1
    ) AS rto_package_instance_id,
    (SELECT id FROM package_instances
     WHERE tenant_id = p_tenant_id
       AND is_active = true
       AND billing_type = 'billable'
       AND billing_category = 'membership_cricos'
     ORDER BY start_date DESC
     LIMIT 1
    ) AS cricos_package_instance_id;
$$;


-- ─── 4.2 Allocate a time entry ──────────────────────────────
CREATE OR REPLACE FUNCTION public.allocate_time_entry(
  p_time_entry_id uuid,
  p_actor uuid DEFAULT NULL,
  p_reason text DEFAULT 'auto'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_entry RECORD;
  v_memberships RECORD;
  v_rto_weight numeric;
  v_cricos_weight numeric;
  v_rto_minutes integer;
  v_cricos_minutes integer;
BEGIN
  -- Load the time entry
  SELECT * INTO v_entry FROM time_entries WHERE id = p_time_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Time entry % not found', p_time_entry_id;
  END IF;

  -- Remove existing allocations (for reallocation)
  DELETE FROM time_entry_allocations WHERE time_entry_id = p_time_entry_id;

  -- Get membership packages
  SELECT * INTO v_memberships
  FROM get_active_membership_packages(v_entry.tenant_id);

  -- No memberships: nothing to allocate
  IF v_memberships.rto_package_instance_id IS NULL
     AND v_memberships.cricos_package_instance_id IS NULL THEN
    RETURN;
  END IF;

  -- Only RTO
  IF v_memberships.rto_package_instance_id IS NOT NULL
     AND v_memberships.cricos_package_instance_id IS NULL THEN
    INSERT INTO time_entry_allocations
      (time_entry_id, tenant_id, package_instance_id, allocated_minutes, allocation_reason)
    VALUES
      (p_time_entry_id, v_entry.tenant_id, v_memberships.rto_package_instance_id,
       v_entry.duration_minutes, p_reason);
    RETURN;
  END IF;

  -- Only CRICOS
  IF v_memberships.rto_package_instance_id IS NULL
     AND v_memberships.cricos_package_instance_id IS NOT NULL THEN
    INSERT INTO time_entry_allocations
      (time_entry_id, tenant_id, package_instance_id, allocated_minutes, allocation_reason)
    VALUES
      (p_time_entry_id, v_entry.tenant_id, v_memberships.cricos_package_instance_id,
       v_entry.duration_minutes, p_reason);
    RETURN;
  END IF;

  -- Both memberships active
  IF v_entry.scope_tag = 'rto' THEN
    INSERT INTO time_entry_allocations
      (time_entry_id, tenant_id, package_instance_id, allocated_minutes, allocation_reason)
    VALUES
      (p_time_entry_id, v_entry.tenant_id, v_memberships.rto_package_instance_id,
       v_entry.duration_minutes, p_reason);
    RETURN;
  END IF;

  IF v_entry.scope_tag = 'cricos' THEN
    INSERT INTO time_entry_allocations
      (time_entry_id, tenant_id, package_instance_id, allocated_minutes, allocation_reason)
    VALUES
      (p_time_entry_id, v_entry.tenant_id, v_memberships.cricos_package_instance_id,
       v_entry.duration_minutes, p_reason);
    RETURN;
  END IF;

  -- scope_tag = 'both': weighted split
  SELECT COALESCE(mag.rto_weight, 0.5), COALESCE(mag.cricos_weight, 0.5)
  INTO v_rto_weight, v_cricos_weight
  FROM membership_allocation_groups mag
  WHERE mag.tenant_id = v_entry.tenant_id;

  IF NOT FOUND THEN
    v_rto_weight := 0.5;
    v_cricos_weight := 0.5;
  END IF;

  v_rto_minutes := floor(v_entry.duration_minutes * v_rto_weight);
  v_cricos_minutes := v_entry.duration_minutes - v_rto_minutes;

  INSERT INTO time_entry_allocations
    (time_entry_id, tenant_id, package_instance_id, allocated_minutes, allocation_reason)
  VALUES
    (p_time_entry_id, v_entry.tenant_id, v_memberships.rto_package_instance_id,
     v_rto_minutes, p_reason),
    (p_time_entry_id, v_entry.tenant_id, v_memberships.cricos_package_instance_id,
     v_cricos_minutes, p_reason);
END;
$$;


-- ─── 4.3 Trigger: auto-allocate on insert ───────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_time_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  PERFORM allocate_time_entry(NEW.id, NEW.user_id, 'auto');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_allocate_insert ON public.time_entries;
CREATE TRIGGER trg_auto_allocate_insert
  AFTER INSERT ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_allocate_time_entry();

-- Trigger: reallocate on scope_tag or duration change
CREATE OR REPLACE FUNCTION public.fn_reallocate_time_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF OLD.scope_tag IS DISTINCT FROM NEW.scope_tag
     OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes THEN
    PERFORM allocate_time_entry(NEW.id, auth.uid(), 'reallocate');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reallocate_update ON public.time_entries;
CREATE TRIGGER trg_reallocate_update
  AFTER UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_reallocate_time_entry();


-- ─── 4.4 Reporting views ────────────────────────────────────

-- Package usage from allocations
CREATE OR REPLACE VIEW public.v_package_minutes_used AS
SELECT
  tea.tenant_id,
  tea.package_instance_id,
  SUM(CASE
    WHEN te.start_at >= date_trunc('month', CURRENT_DATE) THEN tea.allocated_minutes
    ELSE 0
  END) AS minutes_used_month,
  SUM(CASE
    WHEN te.start_at >= date_trunc('year', CURRENT_DATE) THEN tea.allocated_minutes
    ELSE 0
  END) AS minutes_used_ytd,
  SUM(tea.allocated_minutes) AS minutes_used_total,
  MAX(te.start_at) AS last_logged_at
FROM public.time_entry_allocations tea
JOIN public.time_entries te ON te.id = tea.time_entry_id
GROUP BY tea.tenant_id, tea.package_instance_id;

-- Combined membership view
CREATE OR REPLACE VIEW public.v_membership_combined_usage AS
SELECT
  pi.tenant_id,
  SUM(pi.included_minutes) AS total_included_minutes,
  COALESCE(SUM(u.minutes_used_total), 0) AS total_used_minutes,
  SUM(pi.included_minutes) - COALESCE(SUM(u.minutes_used_total), 0) AS remaining_minutes
FROM public.package_instances pi
LEFT JOIN public.v_package_minutes_used u
  ON u.package_instance_id = pi.id AND u.tenant_id = pi.tenant_id
WHERE pi.is_active = true
  AND pi.billing_type = 'billable'
  AND pi.billing_category IN ('membership_rto', 'membership_cricos')
GROUP BY pi.tenant_id;


-- ─── 4.5 Backfill allocations for existing time entries ─────
-- Run allocation for all existing time entries that have data
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.time_entries LOOP
    PERFORM public.allocate_time_entry(r.id, NULL, 'auto');
  END LOOP;
END;
$$;
