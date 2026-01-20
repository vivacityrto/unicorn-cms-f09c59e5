-- ============================================================
-- ENFORCE EOS MEETING OUTCOMES BEFORE CLOSE
-- ============================================================

-- Add meeting status enum values if not exists
DO $$
BEGIN
  -- Add ready_to_close if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ready_to_close' AND enumtypid = 'public.meeting_status'::regtype) THEN
    ALTER TYPE public.meeting_status ADD VALUE 'ready_to_close';
  END IF;
  -- Add closed if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'closed' AND enumtypid = 'public.meeting_status'::regtype) THEN
    ALTER TYPE public.meeting_status ADD VALUE 'closed';
  END IF;
  -- Add locked if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'locked' AND enumtypid = 'public.meeting_status'::regtype) THEN
    ALTER TYPE public.meeting_status ADD VALUE 'locked';
  END IF;
END $$;

-- Add status column to eos_meetings if not exists
ALTER TABLE public.eos_meetings 
ADD COLUMN IF NOT EXISTS status public.meeting_status NOT NULL DEFAULT 'scheduled';

-- Create table for meeting outcome confirmations (explicit "None Required" checkboxes)
CREATE TABLE IF NOT EXISTS public.eos_meeting_outcome_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  outcome_type TEXT NOT NULL CHECK (outcome_type IN ('no_ids_required', 'no_todos_required', 'no_actions_required', 'no_decisions_required', 'no_risks_required', 'alignment_achieved', 'all_rocks_closed', 'flight_plan_confirmed', 'vto_reviewed', 'annual_priorities_set')),
  justification TEXT NOT NULL,
  confirmed_by UUID NOT NULL REFERENCES auth.users(id),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id BIGINT NOT NULL,
  
  CONSTRAINT unique_meeting_outcome UNIQUE(meeting_id, outcome_type)
);

-- Create table for meeting ratings
CREATE TABLE IF NOT EXISTS public.eos_meeting_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id BIGINT NOT NULL,
  
  CONSTRAINT unique_meeting_user_rating UNIQUE(meeting_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_outcome_confirmations_meeting ON public.eos_meeting_outcome_confirmations(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_ratings_meeting ON public.eos_meeting_ratings(meeting_id);

-- Enable RLS
ALTER TABLE public.eos_meeting_outcome_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_meeting_ratings ENABLE ROW LEVEL SECURITY;

-- RLS policies for outcome confirmations
CREATE POLICY "Users can view outcome confirmations for their tenant" 
  ON public.eos_meeting_outcome_confirmations FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert outcome confirmations for their tenant" 
  ON public.eos_meeting_outcome_confirmations FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
  );

-- RLS policies for meeting ratings
CREATE POLICY "Users can view ratings for their tenant" 
  ON public.eos_meeting_ratings FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert their own rating" 
  ON public.eos_meeting_ratings FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update their own rating" 
  ON public.eos_meeting_ratings FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================
-- VALIDATION FUNCTION FOR MEETING CLOSURE
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_meeting_close(p_meeting_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_unmet_requirements TEXT[] := '{}';
  v_todos_count INTEGER;
  v_issues_discussed INTEGER;
  v_decisions_count INTEGER;
  v_ratings_count INTEGER;
  v_participants_count INTEGER;
  v_rocks_pending INTEGER;
  v_has_no_todos_confirm BOOLEAN;
  v_has_no_ids_confirm BOOLEAN;
  v_has_no_actions_confirm BOOLEAN;
  v_has_no_decisions_confirm BOOLEAN;
  v_has_alignment_confirm BOOLEAN;
  v_has_all_rocks_closed BOOLEAN;
  v_has_flight_plan_confirm BOOLEAN;
  v_has_vto_reviewed BOOLEAN;
  v_has_priorities_set BOOLEAN;
  v_has_no_risks_confirm BOOLEAN;
BEGIN
  -- Get meeting details
  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('is_valid', false, 'error', 'Meeting not found', 'unmet_requirements', '{}');
  END IF;

  -- Get counts
  SELECT COUNT(*) INTO v_todos_count 
  FROM public.eos_todos WHERE meeting_id = p_meeting_id;

  SELECT COALESCE(array_length(v_meeting.issues_discussed, 1), 0) INTO v_issues_discussed;

  SELECT COUNT(*) INTO v_ratings_count 
  FROM public.eos_meeting_ratings WHERE meeting_id = p_meeting_id;

  SELECT COUNT(*) INTO v_participants_count 
  FROM public.eos_meeting_participants WHERE meeting_id = p_meeting_id;

  -- Get explicit confirmations
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'no_todos_required') INTO v_has_no_todos_confirm;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'no_ids_required') INTO v_has_no_ids_confirm;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'no_actions_required') INTO v_has_no_actions_confirm;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'no_decisions_required') INTO v_has_no_decisions_confirm;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'alignment_achieved') INTO v_has_alignment_confirm;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'all_rocks_closed') INTO v_has_all_rocks_closed;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'flight_plan_confirmed') INTO v_has_flight_plan_confirm;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'vto_reviewed') INTO v_has_vto_reviewed;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'annual_priorities_set') INTO v_has_priorities_set;
  SELECT EXISTS(SELECT 1 FROM public.eos_meeting_outcome_confirmations 
    WHERE meeting_id = p_meeting_id AND outcome_type = 'no_risks_required') INTO v_has_no_risks_confirm;

  -- Validate based on meeting type
  CASE v_meeting.meeting_type::TEXT
    WHEN 'L10' THEN
      -- IDS Outcomes: At least one issue discussed OR explicit confirmation
      IF v_issues_discussed = 0 AND NOT v_has_no_ids_confirm THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'At least one issue discussed (or confirm "No IDS items required")');
      END IF;
      -- To-Dos: At least one created OR explicit confirmation
      IF v_todos_count = 0 AND NOT v_has_no_todos_confirm THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'At least one To-Do created (or confirm "No To-Dos required")');
      END IF;
      -- Meeting Rating: Each attendee rates
      IF v_ratings_count = 0 THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'At least one meeting rating required');
      END IF;

    WHEN 'Same_Page' THEN
      -- Decisions Recorded
      IF NOT v_has_no_decisions_confirm THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'At least one decision captured (or confirm "No decisions required")');
      END IF;
      -- Next Steps
      IF v_todos_count = 0 AND NOT v_has_no_actions_confirm AND NOT v_has_alignment_confirm THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'At least one action created (or confirm "Alignment achieved, no actions required")');
      END IF;

    WHEN 'Quarterly' THEN
      -- Previous Quarter Rocks all closed
      IF NOT v_has_all_rocks_closed THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'Previous quarter Rocks must be marked Complete, Rolled, or Dropped (or confirm "All Rocks closed")');
      END IF;
      -- Flight Plan confirmed
      IF NOT v_has_flight_plan_confirm THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'Superhero Flight Plan must be confirmed');
      END IF;

    WHEN 'Annual' THEN
      -- V/TO Updated
      IF NOT v_has_vto_reviewed THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'Vision/Traction Organizer must be reviewed');
      END IF;
      -- Annual Priorities Set
      IF NOT v_has_priorities_set THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'At least one annual priority must be defined');
      END IF;
      -- Strategic Risks
      IF NOT v_has_no_risks_confirm THEN
        v_unmet_requirements := array_append(v_unmet_requirements, 'Strategic risks must be logged (or confirm "No risks identified")');
      END IF;

    ELSE
      -- Custom/Focus_Day meetings have no requirements
      NULL;
  END CASE;

  -- Return result
  IF array_length(v_unmet_requirements, 1) > 0 THEN
    RETURN jsonb_build_object(
      'is_valid', false,
      'error', 'Meeting cannot be closed. Required outcomes are missing.',
      'unmet_requirements', to_jsonb(v_unmet_requirements),
      'meeting_type', v_meeting.meeting_type::TEXT,
      'todos_count', v_todos_count,
      'issues_discussed', v_issues_discussed,
      'ratings_count', v_ratings_count
    );
  END IF;

  RETURN jsonb_build_object(
    'is_valid', true,
    'meeting_type', v_meeting.meeting_type::TEXT,
    'todos_count', v_todos_count,
    'issues_discussed', v_issues_discussed,
    'ratings_count', v_ratings_count
  );
END;
$$;

-- ============================================================
-- CLOSE MEETING WITH VALIDATION
-- ============================================================
CREATE OR REPLACE FUNCTION public.close_meeting_with_validation(p_meeting_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation JSONB;
  v_meeting RECORD;
BEGIN
  -- First validate
  v_validation := public.validate_meeting_close(p_meeting_id);

  IF NOT (v_validation->>'is_valid')::BOOLEAN THEN
    -- Log the failed validation
    INSERT INTO public.audit_eos_events (action, entity, entity_id, meeting_id, tenant_id, user_id, details, reason)
    SELECT 'meeting_validation_failed', 'meeting', p_meeting_id::TEXT, p_meeting_id, tenant_id, auth.uid(), v_validation, 'Unmet requirements'
    FROM public.eos_meetings WHERE id = p_meeting_id;

    RETURN v_validation;
  END IF;

  -- Get meeting for tenant_id
  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;

  -- Update meeting status to closed
  UPDATE public.eos_meetings 
  SET 
    status = 'closed',
    is_complete = true, 
    completed_at = now()
  WHERE id = p_meeting_id;

  -- Generate meeting summary
  PERFORM public.generate_meeting_summary(p_meeting_id);

  -- Log the successful close
  INSERT INTO public.audit_eos_events (action, entity, entity_id, meeting_id, tenant_id, user_id, details)
  VALUES ('meeting_closed', 'meeting', p_meeting_id::TEXT, p_meeting_id, v_meeting.tenant_id, auth.uid(), 
    jsonb_build_object('validation', v_validation));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Meeting closed successfully',
    'validation', v_validation
  );
END;
$$;

-- ============================================================
-- SAVE OUTCOME CONFIRMATION
-- ============================================================
CREATE OR REPLACE FUNCTION public.save_outcome_confirmation(
  p_meeting_id UUID,
  p_outcome_type TEXT,
  p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id BIGINT;
BEGIN
  -- Get tenant_id from meeting
  SELECT tenant_id INTO v_tenant_id FROM public.eos_meetings WHERE id = p_meeting_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting not found');
  END IF;

  -- Insert or update confirmation
  INSERT INTO public.eos_meeting_outcome_confirmations (meeting_id, outcome_type, justification, confirmed_by, tenant_id)
  VALUES (p_meeting_id, p_outcome_type, p_justification, auth.uid(), v_tenant_id)
  ON CONFLICT (meeting_id, outcome_type) 
  DO UPDATE SET justification = EXCLUDED.justification, confirmed_by = EXCLUDED.confirmed_by, confirmed_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- SAVE MEETING RATING
-- ============================================================
CREATE OR REPLACE FUNCTION public.save_meeting_rating(
  p_meeting_id UUID,
  p_rating INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id BIGINT;
BEGIN
  IF p_rating < 1 OR p_rating > 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rating must be between 1 and 10');
  END IF;

  -- Get tenant_id from meeting
  SELECT tenant_id INTO v_tenant_id FROM public.eos_meetings WHERE id = p_meeting_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting not found');
  END IF;

  -- Insert or update rating
  INSERT INTO public.eos_meeting_ratings (meeting_id, user_id, rating, tenant_id)
  VALUES (p_meeting_id, auth.uid(), p_rating, v_tenant_id)
  ON CONFLICT (meeting_id, user_id) 
  DO UPDATE SET rating = EXCLUDED.rating;

  RETURN jsonb_build_object('success', true, 'rating', p_rating);
END;
$$;