-- Consultant capacity planning: replace the hard-coded, tier-keyed "weekly required
-- hours" with a planning table keyed PER PACKAGE, and make a client's weekly load the
-- SUM across all of its open packages.
--
-- Why (see docs/audit-log/entries/2026-09-30-capacity-planning-per-package-load.md):
--   compute_client_weekly_required(tenant) - which drives the Membership Dashboard's
--   Consultant Capacity table, the per-client hours in its drawer and
--   auto_assign_consultant() - only ever counted ONE package per client: the open
--   package with the highest weekly hours that appears in membership_tier_capacity_config.
--   So
--     * the newer V2 membership packages (M-DC-V2, M-DR-V2, M-SAR-V2), which were never
--       added to that table, contributed ZERO load (5 clients);
--     * Kick-Start, project and audit packages (KS-*, GC, CHC, ACC, FT-St ...) contributed
--       ZERO load (7 more clients), although they take real consultant time;
--     * a client with two packages of the same tier was counted once (4 clients).
--   12 of 57 active clients with a consultant counted as zero load.
--
-- What this does
--   * Adds public.package_capacity_config (one row per package: weekly_required_hours,
--     where the number came from, notes). Same RLS model as membership_tier_capacity_config:
--     Vivacity team can read, super admins can write.
--   * Seeds it from real data, never inventing numbers (each row records its source):
--       1. tier_table        - every package in membership_tier_capacity_config gets its
--                              tier's existing weekly hours, unchanged;
--       2. copied_from_v1    - the V2 membership packages copy their V1 package's hours;
--       3. straight_line     - every other package with an open instance and defined hours
--                              gets packages.total_hours spread over packages.duration_months.
--     Existing rows are never overwritten on re-run, so edits made in the table survive.
--   * compute_client_weekly_required() now sums, across all of the tenant's open package
--     instances, the package's planning hours (the table, falling back to the same
--     straight-line figure when a package has no row yet, so a newly sold package can
--     never silently count as zero), then applies the existing onboarding multiplier
--     (2.0x for the first 28 days, 1.5x to 56 days). Signature, security and the
--     active-tenant rule are unchanged, so every caller (consultant overview, client
--     drawer, consultant load, auto_assign_consultant) picks it up automatically.
--
-- Not changed: membership_tier_capacity_config (still used by compute_membership_usage),
-- consultant capacity hours, the onboarding multiplier, paused-package handling (paused
-- packages still count, as before), any UI. Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.package_capacity_config (
  package_id            bigint PRIMARY KEY REFERENCES public.packages(id) ON DELETE CASCADE,
  weekly_required_hours numeric(6,2) NOT NULL CHECK (weekly_required_hours >= 0),
  source                text NOT NULL DEFAULT 'manual',
  notes                 text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid
);

COMMENT ON TABLE public.package_capacity_config IS
  'Consultant planning assumption: weekly hours of consultant time one open instance of this package needs. Summed per client by compute_client_weekly_required(), multiplied by the onboarding factor, and used by the Consultant Capacity dashboard and auto_assign_consultant. Not the same thing as included/billable hours. A package with no row falls back to total_hours spread over duration_months.';

ALTER TABLE public.package_capacity_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS package_capacity_config_select ON public.package_capacity_config;
CREATE POLICY package_capacity_config_select ON public.package_capacity_config
  FOR SELECT TO authenticated
  USING (public.is_vivacity_team_safe((SELECT auth.uid())) OR public.is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS package_capacity_config_insert ON public.package_capacity_config;
CREATE POLICY package_capacity_config_insert ON public.package_capacity_config
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS package_capacity_config_update ON public.package_capacity_config;
CREATE POLICY package_capacity_config_update ON public.package_capacity_config
  FOR UPDATE TO authenticated
  USING (public.is_super_admin_safe((SELECT auth.uid())))
  WITH CHECK (public.is_super_admin_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS package_capacity_config_delete ON public.package_capacity_config;
CREATE POLICY package_capacity_config_delete ON public.package_capacity_config
  FOR DELETE TO authenticated
  USING (public.is_super_admin_safe((SELECT auth.uid())));

-- Anonymous users have no business here (RLS would already stop them).
REVOKE ALL ON public.package_capacity_config FROM anon;

DROP TRIGGER IF EXISTS update_package_capacity_config_updated_at ON public.package_capacity_config;
CREATE TRIGGER update_package_capacity_config_updated_at
BEFORE UPDATE ON public.package_capacity_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 1. Every package already in a tier keeps its tier's weekly hours, unchanged.
INSERT INTO public.package_capacity_config (package_id, weekly_required_hours, source, notes)
SELECT pid, m.weekly_required_hours, 'tier_table',
       'Copied from membership_tier_capacity_config, tier ' || m.tier_label
FROM public.membership_tier_capacity_config m
CROSS JOIN LATERAL unnest(m.package_ids) AS pid
WHERE EXISTS (SELECT 1 FROM public.packages p WHERE p.id = pid)
ON CONFLICT (package_id) DO NOTHING;

-- 2. The V2 membership packages take the same weekly hours as their V1 package.
INSERT INTO public.package_capacity_config (package_id, weekly_required_hours, source, notes)
SELECT v2.id, c.weekly_required_hours, 'copied_from_v1', 'Copied from ' || v1.name
FROM public.packages v2
JOIN public.packages v1 ON v1.name = regexp_replace(v2.name, '-V2$', '')
JOIN public.package_capacity_config c ON c.package_id = v1.id
WHERE v2.name ~ '-V2$'
  AND v2.package_type = 'membership'
ON CONFLICT (package_id) DO NOTHING;

-- 3. Any other package that is in use (an open instance exists) and has defined hours:
--    its total hours spread evenly over its own duration.
INSERT INTO public.package_capacity_config (package_id, weekly_required_hours, source, notes)
SELECT p.id,
       round(p.total_hours / (p.duration_months * 52.0 / 12), 2),
       'straight_line',
       'packages.total_hours (' || p.total_hours || ') spread over duration_months (' || p.duration_months || ')'
FROM public.packages p
WHERE p.total_hours > 0
  AND p.duration_months > 0
  AND EXISTS (SELECT 1 FROM public.package_instances pi WHERE pi.package_id = p.id AND pi.is_complete = false)
ON CONFLICT (package_id) DO NOTHING;

-- A client's weekly consultant load = sum over ALL its open packages.
CREATE OR REPLACE FUNCTION public.compute_client_weekly_required(p_tenant_id bigint)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant     RECORD;
  v_base_hours numeric;
  v_days_since numeric;
  v_multiplier numeric;
BEGIN
  SELECT id, client_onboarded_at, created_at, status
  INTO v_tenant
  FROM tenants
  WHERE id = p_tenant_id;

  IF v_tenant IS NULL OR v_tenant.status != 'active' THEN
    RETURN 0;
  END IF;

  -- Planning hours per open package (table first, then the package's own hours spread over
  -- its duration), summed so a client with several packages is counted for all of them.
  SELECT COALESCE(SUM(
           COALESCE(
             pcc.weekly_required_hours,
             CASE WHEN p.total_hours > 0 AND p.duration_months > 0
                  THEN p.total_hours / (p.duration_months * 52.0 / 12) END,
             0)
         ), 0)
  INTO v_base_hours
  FROM package_instances pi
  JOIN packages p ON p.id = pi.package_id
  LEFT JOIN package_capacity_config pcc ON pcc.package_id = pi.package_id
  WHERE pi.tenant_id = p_tenant_id
    AND pi.is_complete = false;

  IF v_base_hours <= 0 THEN
    RETURN 0;
  END IF;

  v_days_since := EXTRACT(EPOCH FROM (now() - COALESCE(v_tenant.client_onboarded_at, v_tenant.created_at))) / 86400.0;

  IF v_days_since <= 28 THEN v_multiplier := 2.0;
  ELSIF v_days_since <= 56 THEN v_multiplier := 1.5;
  ELSE v_multiplier := 1.0;
  END IF;

  RETURN ROUND(v_base_hours * v_multiplier, 2);
END;
$function$;
