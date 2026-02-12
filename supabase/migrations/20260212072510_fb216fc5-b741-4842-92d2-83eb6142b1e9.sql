
-- ============================================================
-- Tenant-scoped membership tier capacity config
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenant_tier_capacity_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tier_name text NOT NULL,
  weekly_required_hours numeric(10,2) NOT NULL DEFAULT 0,
  annual_included_hours numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,

  CONSTRAINT uq_tenant_tier UNIQUE (tenant_id, tier_name),
  CONSTRAINT chk_weekly_hours CHECK (weekly_required_hours >= 0),
  CONSTRAINT chk_annual_hours CHECK (annual_included_hours >= 0)
);

CREATE INDEX idx_tenant_tier_config_tenant ON public.tenant_tier_capacity_config(tenant_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.tenant_tier_capacity_config ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their own tenant's config
CREATE POLICY "Tenant members can read tier config"
  ON public.tenant_tier_capacity_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = tenant_tier_capacity_config.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
    OR public.is_vivacity_team_safe(auth.uid())
  );

-- Only Vivacity SuperAdmin can insert
CREATE POLICY "Vivacity SuperAdmin can insert tier config"
  ON public.tenant_tier_capacity_config FOR INSERT
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- Only Vivacity SuperAdmin can update
CREATE POLICY "Vivacity SuperAdmin can update tier config"
  ON public.tenant_tier_capacity_config FOR UPDATE
  USING (public.is_super_admin_safe(auth.uid()));

-- Only Vivacity SuperAdmin can delete
CREATE POLICY "Vivacity SuperAdmin can delete tier config"
  ON public.tenant_tier_capacity_config FOR DELETE
  USING (public.is_super_admin_safe(auth.uid()));

-- ============================================================
-- Seed defaults for all existing active tenants
-- ============================================================
INSERT INTO public.tenant_tier_capacity_config (tenant_id, tier_name, weekly_required_hours, annual_included_hours)
SELECT t.id, v.tier_name, v.weekly_required_hours, v.annual_included_hours
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('Amethyst', 0.10, 0.00),
    ('Gold',     0.40, 14.00),
    ('Ruby',     0.91, 35.00),
    ('Sapphire', 1.55, 63.00),
    ('Diamond',  2.32, 98.00)
) AS v(tier_name, weekly_required_hours, annual_included_hours)
WHERE t.status = 'active'
ON CONFLICT (tenant_id, tier_name) DO NOTHING;
