-- Create ai_quality_events table for Ask Viv telemetry
CREATE TABLE IF NOT EXISTS public.ai_quality_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),

  user_id uuid NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  tenant_id integer NULL,

  mode text NOT NULL CHECK (mode IN ('knowledge', 'compliance')),
  intent text NULL CHECK (intent IN ('status', 'explanation', 'gap_analysis', 'decision_request', 'out_of_scope')),

  blocked boolean NOT NULL DEFAULT false,
  block_categories text[] NOT NULL DEFAULT '{}',
  repaired boolean NOT NULL DEFAULT false,

  confidence text NULL CHECK (confidence IN ('High', 'Medium', 'Low')),

  gap_keys text[] NOT NULL DEFAULT '{}',

  ai_interaction_log_id uuid NULL REFERENCES public.ai_interaction_logs(id) ON DELETE SET NULL,

  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ai_quality_events_occurred_at ON public.ai_quality_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_quality_events_mode ON public.ai_quality_events(mode);
CREATE INDEX IF NOT EXISTS idx_ai_quality_events_blocked ON public.ai_quality_events(blocked);
CREATE INDEX IF NOT EXISTS idx_ai_quality_events_user_id ON public.ai_quality_events(user_id);

-- Add comment for documentation
COMMENT ON TABLE public.ai_quality_events IS 'Internal-only telemetry for Ask Viv quality monitoring. No prompt/response content stored.';

-- Enable Row Level Security
ALTER TABLE public.ai_quality_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Vivacity internal users can select events
CREATE POLICY "vivacity_internal_select_ai_quality_events"
ON public.ai_quality_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND u.is_vivacity_internal = true
      AND u.archived = false
  )
);

-- RLS Policy: Vivacity internal users can insert events
CREATE POLICY "vivacity_internal_insert_ai_quality_events"
ON public.ai_quality_events
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND u.is_vivacity_internal = true
      AND u.archived = false
  )
);