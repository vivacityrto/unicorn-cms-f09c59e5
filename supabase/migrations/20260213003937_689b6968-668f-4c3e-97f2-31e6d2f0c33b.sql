
-- ============================================================
-- tenant_engagement_settings: per-tenant engagement controls
-- ============================================================
CREATE TABLE public.tenant_engagement_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) UNIQUE,
  celebrations_enabled boolean NOT NULL DEFAULT true,
  sound_enabled boolean NOT NULL DEFAULT false,
  weekly_win_tracker_enabled boolean NOT NULL DEFAULT true,
  leaderboard_enabled boolean NOT NULL DEFAULT false,
  completion_cascade_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

CREATE INDEX idx_tenant_engagement_tenant ON public.tenant_engagement_settings(tenant_id);

ALTER TABLE public.tenant_engagement_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view engagement settings"
  ON public.tenant_engagement_settings FOR SELECT
  USING (public.has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "SuperAdmins can manage engagement settings"
  ON public.tenant_engagement_settings FOR ALL
  USING (public.is_super_admin_safe(auth.uid()));

-- ============================================================
-- engagement_audit_log: logs all celebration/badge events with validation
-- ============================================================
CREATE TABLE public.engagement_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  client_id bigint NULL,
  package_instance_id bigint NULL,
  actor_user_uuid uuid NULL,
  event_type text NOT NULL,
  tier text NULL,
  integrity_validation_passed boolean NOT NULL DEFAULT true,
  validation_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_engagement_audit_tenant ON public.engagement_audit_log(tenant_id, created_at DESC);

ALTER TABLE public.engagement_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view engagement audit"
  ON public.engagement_audit_log FOR SELECT
  USING (public.has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "Authenticated users can insert engagement audit"
  ON public.engagement_audit_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
