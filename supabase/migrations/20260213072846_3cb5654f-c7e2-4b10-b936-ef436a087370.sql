
-- ============================================
-- AI Audit Logging Tables - Phase 1
-- ============================================

-- ai_events: core audit record for every AI interaction
CREATE TABLE public.ai_events (
  ai_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  actor_user_id uuid NOT NULL,
  feature text NOT NULL,
  task_type text NOT NULL,
  request_id text NOT NULL,
  input_hash text NOT NULL,
  context_hash text NOT NULL,
  model_name text NOT NULL,
  latency_ms int,
  status text NOT NULL,
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ai_event_payloads: stores full request/response JSON (1:1 with ai_events)
CREATE TABLE public.ai_event_payloads (
  ai_event_id uuid PRIMARY KEY REFERENCES public.ai_events(ai_event_id) ON DELETE CASCADE,
  request_json jsonb NOT NULL,
  context_json jsonb,
  response_json jsonb,
  citations_json jsonb,
  error_json jsonb
);

-- ai_feedback: user ratings and overrides on AI outputs
CREATE TABLE public.ai_feedback (
  ai_feedback_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_event_id uuid NOT NULL REFERENCES public.ai_events(ai_event_id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  actor_user_id uuid NOT NULL,
  rating int,
  override_reason text,
  corrected_output jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Validation triggers (instead of CHECK constraints)
-- ============================================

-- Validate ai_events.status
CREATE OR REPLACE FUNCTION public.validate_ai_event_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('success', 'blocked', 'error') THEN
    RAISE EXCEPTION 'Invalid ai_events.status: %. Must be success, blocked, or error.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_ai_event_status
  BEFORE INSERT ON public.ai_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_ai_event_status();

-- Validate ai_feedback.rating (1-5)
CREATE OR REPLACE FUNCTION public.validate_ai_feedback_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.rating IS NOT NULL AND (NEW.rating < 1 OR NEW.rating > 5) THEN
    RAISE EXCEPTION 'Invalid ai_feedback.rating: %. Must be between 1 and 5.', NEW.rating;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_ai_feedback_rating
  BEFORE INSERT ON public.ai_feedback
  FOR EACH ROW EXECUTE FUNCTION public.validate_ai_feedback_rating();

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX idx_ai_events_tenant_created ON public.ai_events(tenant_id, created_at DESC);
CREATE INDEX idx_ai_events_feature_created ON public.ai_events(feature, created_at DESC);
CREATE INDEX idx_ai_events_request_id ON public.ai_events(request_id);
CREATE INDEX idx_ai_feedback_tenant_created ON public.ai_feedback(tenant_id, created_at DESC);

-- ============================================
-- RLS: Enable on all tables
-- ============================================

ALTER TABLE public.ai_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_event_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: ai_events (SELECT + INSERT only)
-- ============================================

CREATE POLICY "vivacity_staff_select_ai_events"
  ON public.ai_events FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "vivacity_staff_insert_ai_events"
  ON public.ai_events FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- No UPDATE or DELETE policies = immutable

-- ============================================
-- RLS Policies: ai_event_payloads (SELECT + INSERT only)
-- ============================================

CREATE POLICY "vivacity_staff_select_ai_event_payloads"
  ON public.ai_event_payloads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_events e
      WHERE e.ai_event_id = ai_event_payloads.ai_event_id
    )
  );

CREATE POLICY "vivacity_staff_insert_ai_event_payloads"
  ON public.ai_event_payloads FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- No UPDATE or DELETE policies = immutable

-- ============================================
-- RLS Policies: ai_feedback (SELECT + INSERT only)
-- ============================================

CREATE POLICY "vivacity_staff_select_ai_feedback"
  ON public.ai_feedback FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "vivacity_staff_insert_ai_feedback"
  ON public.ai_feedback FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- No UPDATE or DELETE policies = insert-only

-- ============================================
-- Hard immutability: block UPDATE/DELETE at trigger level
-- ============================================

CREATE OR REPLACE FUNCTION public.block_ai_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'AI audit records are immutable. UPDATE and DELETE are not permitted on %.', TG_TABLE_NAME;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_block_ai_events_update
  BEFORE UPDATE ON public.ai_events
  FOR EACH ROW EXECUTE FUNCTION public.block_ai_event_mutation();

CREATE TRIGGER trg_block_ai_events_delete
  BEFORE DELETE ON public.ai_events
  FOR EACH ROW EXECUTE FUNCTION public.block_ai_event_mutation();

CREATE TRIGGER trg_block_ai_event_payloads_update
  BEFORE UPDATE ON public.ai_event_payloads
  FOR EACH ROW EXECUTE FUNCTION public.block_ai_event_mutation();

CREATE TRIGGER trg_block_ai_event_payloads_delete
  BEFORE DELETE ON public.ai_event_payloads
  FOR EACH ROW EXECUTE FUNCTION public.block_ai_event_mutation();

CREATE TRIGGER trg_block_ai_feedback_update
  BEFORE UPDATE ON public.ai_feedback
  FOR EACH ROW EXECUTE FUNCTION public.block_ai_event_mutation();

CREATE TRIGGER trg_block_ai_feedback_delete
  BEFORE DELETE ON public.ai_feedback
  FOR EACH ROW EXECUTE FUNCTION public.block_ai_event_mutation();
