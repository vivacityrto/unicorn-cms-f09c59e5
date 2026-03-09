
-- Add new columns to eos_scorecard
ALTER TABLE public.eos_scorecard
  ADD COLUMN IF NOT EXISTS description text;

-- Add new columns to eos_scorecard_metrics
ALTER TABLE public.eos_scorecard_metrics
  ADD COLUMN IF NOT EXISTS metric_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS metric_key text,
  ADD COLUMN IF NOT EXISTS example_result text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Add new columns to eos_scorecard_entries
ALTER TABLE public.eos_scorecard_entries
  ADD COLUMN IF NOT EXISTS actual_value numeric,
  ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill actual_value from value column for existing entries
UPDATE public.eos_scorecard_entries SET actual_value = value WHERE actual_value IS NULL;

-- Create scorecard_metric_automation_rules table
CREATE TABLE IF NOT EXISTS public.scorecard_metric_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id uuid NOT NULL REFERENCES public.eos_scorecard_metrics(id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL,
  source_type text NOT NULL,
  source_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_run_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on automation rules
ALTER TABLE public.scorecard_metric_automation_rules ENABLE ROW LEVEL SECURITY;

-- RLS policies for automation rules
CREATE POLICY "Vivacity team can view automation_rules"
  ON public.scorecard_metric_automation_rules
  FOR SELECT
  USING (is_vivacity_team_user(auth.uid()));

CREATE POLICY "Vivacity team can manage automation_rules"
  ON public.scorecard_metric_automation_rules
  FOR ALL
  USING (is_vivacity_team_user(auth.uid()))
  WITH CHECK (is_vivacity_team_user(auth.uid()));

CREATE POLICY "Tenant users can view automation_rules"
  ON public.scorecard_metric_automation_rules
  FOR SELECT
  USING (tenant_id = get_current_user_tenant() OR is_super_admin());

CREATE POLICY "Admins can manage automation_rules"
  ON public.scorecard_metric_automation_rules
  FOR ALL
  USING (is_super_admin() OR (tenant_id = get_current_user_tenant() AND get_current_user_role() = 'Admin'))
  WITH CHECK (is_super_admin() OR (tenant_id = get_current_user_tenant() AND get_current_user_role() = 'Admin'));

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_scorecard_entries_metric_week ON public.eos_scorecard_entries(metric_id, week_ending DESC);
CREATE INDEX IF NOT EXISTS idx_scorecard_metrics_scorecard ON public.eos_scorecard_metrics(scorecard_id, is_active, is_archived);
CREATE INDEX IF NOT EXISTS idx_automation_rules_metric ON public.scorecard_metric_automation_rules(metric_id, is_enabled);
