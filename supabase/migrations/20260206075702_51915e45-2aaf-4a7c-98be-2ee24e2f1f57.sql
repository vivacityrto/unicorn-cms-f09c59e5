-- Add add-in specific columns to calendar_events
ALTER TABLE public.calendar_events 
ADD COLUMN IF NOT EXISTS addin_captured_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS addin_captured_by uuid NULL REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS teams_join_url text NULL,
ADD COLUMN IF NOT EXISTS organiser_email text NULL,
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'sync';

-- Add index for add-in lookup by external event id per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_addin_user_external 
ON public.calendar_events(user_id, provider_event_id) 
WHERE source = 'addin';

-- Create meeting capture audit table
CREATE TABLE IF NOT EXISTS public.meeting_capture_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text NULL,
  entity_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on audit table
ALTER TABLE public.meeting_capture_audit ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view their own audit entries
CREATE POLICY "Users can view own meeting audit"
ON public.meeting_capture_audit
FOR SELECT USING (auth.uid() = user_id);

-- RLS: Service role can insert
CREATE POLICY "Service role can manage meeting audit"
ON public.meeting_capture_audit
FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Add index for audit lookups
CREATE INDEX idx_meeting_capture_audit_event ON public.meeting_capture_audit(calendar_event_id);
CREATE INDEX idx_meeting_capture_audit_user ON public.meeting_capture_audit(user_id, created_at DESC);

-- Add source column to calendar_time_drafts if not exists
ALTER TABLE public.calendar_time_drafts
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'auto';

COMMENT ON COLUMN public.calendar_events.source IS 'sync = calendar sync, addin = captured via add-in';
COMMENT ON COLUMN public.calendar_time_drafts.source IS 'auto = automated from sync, addin = captured via add-in';