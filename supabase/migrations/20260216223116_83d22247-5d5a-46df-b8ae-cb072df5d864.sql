
-- ============================================================
-- Phase 10: Predictive Capacity & Workload Intelligence
-- ============================================================

-- 1) consultant_capacity_profiles
CREATE TABLE public.consultant_capacity_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  work_days_per_week integer NOT NULL DEFAULT 5,
  standard_daily_hours numeric NOT NULL DEFAULT 7.5,
  admin_buffer_percentage numeric NOT NULL DEFAULT 20,
  max_concurrent_high_risk_stages integer NOT NULL DEFAULT 3,
  effective_weekly_capacity_hours numeric GENERATED ALWAYS AS (
    work_days_per_week * standard_daily_hours * (1 - admin_buffer_percentage / 100)
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_capacity_user UNIQUE (user_id)
);

ALTER TABLE public.consultant_capacity_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "capacity_profiles_select_own"
  ON public.consultant_capacity_profiles FOR SELECT
  USING (auth.uid()::text = user_id::text OR public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "capacity_profiles_manage_vivacity"
  ON public.consultant_capacity_profiles FOR ALL
  USING (public.is_vivacity_team_safe(auth.uid()));

-- 2) workload_snapshots
CREATE TABLE public.workload_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  open_tasks_count integer NOT NULL DEFAULT 0,
  overdue_tasks_count integer NOT NULL DEFAULT 0,
  active_stages_count integer NOT NULL DEFAULT 0,
  high_risk_stages_count integer NOT NULL DEFAULT 0,
  consult_hours_last_30_days numeric NOT NULL DEFAULT 0,
  forecast_hours_next_30_days numeric NOT NULL DEFAULT 0,
  capacity_utilisation_percentage numeric NOT NULL DEFAULT 0,
  overload_risk_status text NOT NULL DEFAULT 'stable',
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_overload_status CHECK (overload_risk_status IN ('stable', 'elevated', 'high', 'critical'))
);

CREATE INDEX idx_workload_snapshots_user ON public.workload_snapshots(user_id);
CREATE INDEX idx_workload_snapshots_date ON public.workload_snapshots(snapshot_date);
CREATE INDEX idx_workload_snapshots_status ON public.workload_snapshots(overload_risk_status);

ALTER TABLE public.workload_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workload_snapshots_select_own"
  ON public.workload_snapshots FOR SELECT
  USING (auth.uid()::text = user_id::text OR public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "workload_snapshots_insert_system"
  ON public.workload_snapshots FOR INSERT
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- 3) tenant_package_burn_forecast
CREATE TABLE public.tenant_package_burn_forecast (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  package_id bigint NOT NULL,
  total_hours_allocated numeric NOT NULL DEFAULT 0,
  hours_used_to_date numeric NOT NULL DEFAULT 0,
  average_monthly_usage numeric NOT NULL DEFAULT 0,
  projected_exhaustion_date date,
  burn_risk_status text NOT NULL DEFAULT 'on_track',
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_burn_status CHECK (burn_risk_status IN ('on_track', 'accelerated', 'critical'))
);

CREATE INDEX idx_burn_forecast_tenant ON public.tenant_package_burn_forecast(tenant_id);
CREATE INDEX idx_burn_forecast_status ON public.tenant_package_burn_forecast(burn_risk_status);

ALTER TABLE public.tenant_package_burn_forecast ENABLE ROW LEVEL SECURITY;

CREATE POLICY "burn_forecast_select_tenant"
  ON public.tenant_package_burn_forecast FOR SELECT
  USING (public.has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "burn_forecast_insert_system"
  ON public.tenant_package_burn_forecast FOR INSERT
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- 4) Materialized views for trends
CREATE MATERIALIZED VIEW public.v_consultant_capacity_trends AS
SELECT
  user_id,
  AVG(capacity_utilisation_percentage) AS avg_utilisation,
  MAX(capacity_utilisation_percentage) AS peak_utilisation,
  COUNT(*) FILTER (WHERE overload_risk_status = 'critical') AS critical_days,
  COUNT(*) FILTER (WHERE overload_risk_status = 'high') AS high_days,
  AVG(overdue_tasks_count) AS avg_overdue_tasks,
  AVG(high_risk_stages_count) AS avg_high_risk_stages
FROM public.workload_snapshots
WHERE snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY user_id;

CREATE INDEX idx_v_consultant_capacity_trends_user ON public.v_consultant_capacity_trends(user_id);

CREATE MATERIALIZED VIEW public.v_package_burn_trends AS
SELECT
  tenant_id,
  COUNT(*) AS total_packages,
  COUNT(*) FILTER (WHERE burn_risk_status = 'critical') AS critical_burn_count,
  COUNT(*) FILTER (WHERE burn_risk_status = 'accelerated') AS accelerated_burn_count,
  AVG(average_monthly_usage) AS avg_monthly_usage,
  MIN(projected_exhaustion_date) AS earliest_exhaustion
FROM public.tenant_package_burn_forecast
WHERE generated_at >= now() - INTERVAL '7 days'
GROUP BY tenant_id;

CREATE INDEX idx_v_package_burn_trends_tenant ON public.v_package_burn_trends(tenant_id);

-- 5) Audit trigger for workload snapshots
CREATE OR REPLACE FUNCTION public.log_workload_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, details)
  VALUES (
    'workload_snapshot_created',
    'workload_snapshots',
    NEW.id::text,
    jsonb_build_object(
      'user_id', NEW.user_id,
      'capacity_pct', NEW.capacity_utilisation_percentage,
      'overload_status', NEW.overload_risk_status,
      'snapshot_date', NEW.snapshot_date
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_workload_snapshot
  AFTER INSERT ON public.workload_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.log_workload_snapshot();

-- 6) Audit trigger for burn forecast
CREATE OR REPLACE FUNCTION public.log_burn_forecast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, details)
  VALUES (
    'burn_forecast_created',
    'tenant_package_burn_forecast',
    NEW.id::text,
    jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'package_id', NEW.package_id,
      'burn_risk_status', NEW.burn_risk_status,
      'projected_exhaustion', NEW.projected_exhaustion_date
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_burn_forecast
  AFTER INSERT ON public.tenant_package_burn_forecast
  FOR EACH ROW
  EXECUTE FUNCTION public.log_burn_forecast();
