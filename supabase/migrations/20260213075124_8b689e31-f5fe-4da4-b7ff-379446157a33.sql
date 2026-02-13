
-- ============================================================
-- Prompt 8: AI Feature Flags + Rate Limiting + Safety Hardening
-- ============================================================

-- 1. Add AI feature flags to app_settings (global defaults, all OFF)
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS ai_meeting_summary_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_doc_extract_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_phase_check_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_risk_radar_enabled boolean NOT NULL DEFAULT false;

-- 2. Tenant-level AI feature flag overrides
CREATE TABLE public.ai_feature_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  flag_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, flag_name)
);

-- Validation trigger for flag_name
CREATE OR REPLACE FUNCTION public.validate_ai_feature_override()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.flag_name NOT IN (
    'ai_meeting_summary_enabled',
    'ai_doc_extract_enabled',
    'ai_phase_check_enabled',
    'ai_risk_radar_enabled'
  ) THEN
    RAISE EXCEPTION 'Invalid flag_name: %. Must be one of: ai_meeting_summary_enabled, ai_doc_extract_enabled, ai_phase_check_enabled, ai_risk_radar_enabled', NEW.flag_name;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_ai_feature_override
  BEFORE INSERT OR UPDATE ON public.ai_feature_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_ai_feature_override();

-- RLS for ai_feature_overrides
ALTER TABLE public.ai_feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmins can read ai_feature_overrides"
  ON public.ai_feature_overrides FOR SELECT
  USING (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "SuperAdmins can insert ai_feature_overrides"
  ON public.ai_feature_overrides FOR INSERT
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "SuperAdmins can update ai_feature_overrides"
  ON public.ai_feature_overrides FOR UPDATE
  USING (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "SuperAdmins can delete ai_feature_overrides"
  ON public.ai_feature_overrides FOR DELETE
  USING (public.is_super_admin_safe(auth.uid()));

-- Vivacity staff can read (for feature checks in edge functions)
CREATE POLICY "Vivacity staff can read ai_feature_overrides"
  ON public.ai_feature_overrides FOR SELECT
  USING (public.is_vivacity_internal_safe(auth.uid()));

-- Index
CREATE INDEX idx_ai_feature_overrides_tenant ON public.ai_feature_overrides (tenant_id);

-- 3. Rate limiting table for AI requests
CREATE TABLE public.ai_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id bigint NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count int NOT NULL DEFAULT 1,
  UNIQUE(user_id, tenant_id, window_start)
);

ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role should access this (edge functions use service role key)
-- No client-side policies needed
CREATE POLICY "No direct client access to ai_rate_limits"
  ON public.ai_rate_limits FOR SELECT
  USING (false);

-- Cleanup function for old rate limit windows
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM public.ai_rate_limits
  WHERE window_start < now() - interval '2 hours';
END;
$$ LANGUAGE plpgsql SET search_path = public SECURITY DEFINER;

-- Helper function to check + increment rate limit
-- Returns true if allowed, false if rate limited
CREATE OR REPLACE FUNCTION public.check_ai_rate_limit(
  p_user_id uuid,
  p_tenant_id bigint,
  p_max_per_hour int DEFAULT 30,
  p_max_per_tenant_hour int DEFAULT 100
)
RETURNS boolean AS $$
DECLARE
  v_window timestamptz;
  v_user_count int;
  v_tenant_count int;
BEGIN
  -- Truncate to hour for windowing
  v_window := date_trunc('hour', now());
  
  -- Cleanup old entries
  DELETE FROM public.ai_rate_limits WHERE window_start < v_window - interval '1 hour';
  
  -- Check user rate
  SELECT COALESCE(SUM(request_count), 0) INTO v_user_count
  FROM public.ai_rate_limits
  WHERE user_id = p_user_id AND window_start = v_window;
  
  IF v_user_count >= p_max_per_hour THEN
    RETURN false;
  END IF;
  
  -- Check tenant rate
  SELECT COALESCE(SUM(request_count), 0) INTO v_tenant_count
  FROM public.ai_rate_limits
  WHERE tenant_id = p_tenant_id AND window_start = v_window;
  
  IF v_tenant_count >= p_max_per_tenant_hour THEN
    RETURN false;
  END IF;
  
  -- Upsert rate counter
  INSERT INTO public.ai_rate_limits (user_id, tenant_id, window_start, request_count)
  VALUES (p_user_id, p_tenant_id, v_window, 1)
  ON CONFLICT (user_id, tenant_id, window_start)
  DO UPDATE SET request_count = public.ai_rate_limits.request_count + 1;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SET search_path = public SECURITY DEFINER;

COMMENT ON TABLE public.ai_feature_overrides IS 'Per-tenant AI feature flag overrides. Overrides global app_settings defaults.';
COMMENT ON TABLE public.ai_rate_limits IS 'Sliding window rate limiting for AI requests. Managed by edge functions via service role.';
COMMENT ON FUNCTION public.check_ai_rate_limit IS 'Checks and increments AI rate limit. Returns true if request is allowed.';
