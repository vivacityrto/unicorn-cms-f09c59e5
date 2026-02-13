
-- ============================================================
-- user_ui_prefs: stores user celebration & motion preferences
-- ============================================================
CREATE TABLE public.user_ui_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid uuid NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  reduce_motion boolean NOT NULL DEFAULT false,
  celebrations_enabled boolean NOT NULL DEFAULT true,
  sound_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_ui_prefs_user_uuid_unique UNIQUE (user_uuid)
);

ALTER TABLE public.user_ui_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ui prefs"
  ON public.user_ui_prefs FOR SELECT
  USING (auth.uid() = user_uuid);

CREATE POLICY "Users can insert own ui prefs"
  ON public.user_ui_prefs FOR INSERT
  WITH CHECK (auth.uid() = user_uuid);

CREATE POLICY "Users can update own ui prefs"
  ON public.user_ui_prefs FOR UPDATE
  USING (auth.uid() = user_uuid);

-- ============================================================
-- celebration_events: logs milestone triggers for audit
-- ============================================================
CREATE TABLE public.celebration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  actor_user_uuid uuid NOT NULL,
  client_id bigint NULL,
  package_id bigint NULL,
  source_module text NOT NULL CHECK (source_module IN ('compliance', 'eos', 'time', 'documents', 'integrations', 'admin')),
  event_type text NOT NULL CHECK (event_type IN ('section_complete', 'phase_complete', 'package_complete', 'risk_resolved', 'hours_milestone', 'healthcheck_complete', 'integration_clean_sync')),
  tier int NOT NULL CHECK (tier IN (1, 2, 3)),
  title text NOT NULL,
  subtitle text NULL,
  cta_label text NULL,
  cta_href text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_celebration_events_tenant_created ON public.celebration_events (tenant_id, created_at DESC);
CREATE INDEX idx_celebration_events_actor_created ON public.celebration_events (actor_user_uuid, created_at DESC);

ALTER TABLE public.celebration_events ENABLE ROW LEVEL SECURITY;

-- Tenant-scoped access using existing helper
CREATE POLICY "Tenant members can view celebration events"
  ON public.celebration_events FOR SELECT
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "Authenticated users can insert celebration events"
  ON public.celebration_events FOR INSERT
  WITH CHECK (auth.uid() = actor_user_uuid AND has_tenant_access_safe(tenant_id, auth.uid()));
