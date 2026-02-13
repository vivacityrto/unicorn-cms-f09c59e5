
-- ============================================================
-- meeting_summaries: AI-generated meeting summary storage
-- Phase 1: transcript/notes → structured summary with audit link
-- ============================================================

CREATE TABLE public.meeting_summaries (
  meeting_summary_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  meeting_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  source text NOT NULL,
  summary_text text NOT NULL,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks_raised jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric,
  ai_event_id uuid NULL REFERENCES public.ai_events(ai_event_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Validation trigger for source column
CREATE OR REPLACE FUNCTION public.validate_meeting_summary_source()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source NOT IN ('transcript', 'notes') THEN
    RAISE EXCEPTION 'meeting_summaries.source must be transcript or notes, got: %', NEW.source;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_meeting_summary_source
  BEFORE INSERT OR UPDATE ON public.meeting_summaries
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_meeting_summary_source();

-- Indexes
CREATE INDEX idx_meeting_summaries_tenant_meeting 
  ON public.meeting_summaries(tenant_id, meeting_id);
CREATE INDEX idx_meeting_summaries_meeting_id 
  ON public.meeting_summaries(meeting_id);

-- Enable RLS
ALTER TABLE public.meeting_summaries ENABLE ROW LEVEL SECURITY;

-- Vivacity staff: full access scoped to tenant
CREATE POLICY "meeting_summaries_staff_select"
  ON public.meeting_summaries FOR SELECT
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "meeting_summaries_staff_insert"
  ON public.meeting_summaries FOR INSERT
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "meeting_summaries_staff_update"
  ON public.meeting_summaries FOR UPDATE
  USING (is_vivacity_team_safe(auth.uid()));

-- Clients cannot access meeting_summaries in Phase 1
-- (no client policies added intentionally)
