
-- Table: exec_weekly_reviews
CREATE TABLE public.exec_weekly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_uuid uuid NOT NULL,
  week_start_date date NOT NULL,
  visionary_user_uuid uuid NULL,
  integrator_user_uuid uuid NULL,
  status text NOT NULL DEFAULT 'draft',
  headline text NULL,
  portfolio_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  discussion_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_uuid uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_uuid uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_week UNIQUE (tenant_uuid, week_start_date)
);

-- Indexes
CREATE INDEX idx_exec_weekly_reviews_tenant_week ON public.exec_weekly_reviews (tenant_uuid, week_start_date DESC);
CREATE INDEX idx_exec_weekly_reviews_decisions ON public.exec_weekly_reviews USING GIN (decisions);
CREATE INDEX idx_exec_weekly_reviews_next_actions ON public.exec_weekly_reviews USING GIN (next_actions);

-- Enable RLS
ALTER TABLE public.exec_weekly_reviews ENABLE ROW LEVEL SECURITY;

-- RLS: Vivacity team (SuperAdmin, Team Leader, Team Member) can select
CREATE POLICY "vivacity_team_select_exec_weekly_reviews"
  ON public.exec_weekly_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

-- RLS: Vivacity team can insert
CREATE POLICY "vivacity_team_insert_exec_weekly_reviews"
  ON public.exec_weekly_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- RLS: Vivacity team can update (only drafts unless SuperAdmin)
CREATE POLICY "vivacity_team_update_exec_weekly_reviews"
  ON public.exec_weekly_reviews
  FOR UPDATE
  TO authenticated
  USING (
    public.is_vivacity_team_safe(auth.uid())
    AND (status = 'draft' OR public.is_super_admin_safe(auth.uid()))
  );

-- Audit log table
CREATE TABLE public.exec_weekly_review_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.exec_weekly_reviews(id) ON DELETE CASCADE,
  action text NOT NULL,
  user_id uuid NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_exec_weekly_review_audit_review ON public.exec_weekly_review_audit_log (review_id, created_at DESC);

ALTER TABLE public.exec_weekly_review_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vivacity_team_select_audit_log"
  ON public.exec_weekly_review_audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "vivacity_team_insert_audit_log"
  ON public.exec_weekly_review_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_exec_weekly_review_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_exec_weekly_review_updated_at
  BEFORE UPDATE ON public.exec_weekly_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_exec_weekly_review_updated_at();
