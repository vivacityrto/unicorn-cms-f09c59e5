
-- Add AI minutes settings to app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS minutes_ai_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS minutes_ai_require_review boolean NOT NULL DEFAULT true;

-- Create meeting_minutes_ai_runs table for audit/traceability
CREATE TABLE public.meeting_minutes_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL,
  meeting_id uuid NOT NULL,
  minutes_id uuid NOT NULL,
  transcript_artifact_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'started',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  error text NULL,
  token_usage jsonb NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_runs_meeting_id ON public.meeting_minutes_ai_runs(meeting_id);
CREATE INDEX idx_ai_runs_minutes_id ON public.meeting_minutes_ai_runs(minutes_id);

ALTER TABLE public.meeting_minutes_ai_runs ENABLE ROW LEVEL SECURITY;

-- Only Vivacity team can access AI runs
CREATE POLICY "vivacity_team_manage_ai_runs"
  ON public.meeting_minutes_ai_runs
  FOR ALL
  USING (is_vivacity_internal_safe(auth.uid()));
