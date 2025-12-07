-- Create recurrence tables for EOS meetings
CREATE TABLE IF NOT EXISTS public.eos_meeting_recurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL,
  recurrence_type TEXT NOT NULL CHECK (recurrence_type IN ('weekly', 'quarterly', 'annual')),
  rrule TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  until_date TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.eos_meeting_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurrence_id UUID REFERENCES public.eos_meeting_recurrences(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES public.eos_meetings(id) ON DELETE SET NULL,
  tenant_id BIGINT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  is_generated BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.eos_meeting_recurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_meeting_occurrences ENABLE ROW LEVEL SECURITY;

-- RLS policies for recurrences
CREATE POLICY "Users can view their tenant recurrences"
ON public.eos_meeting_recurrences FOR SELECT
USING (
  is_super_admin() OR 
  (tenant_id = get_current_user_tenant() AND has_any_eos_role(auth.uid(), tenant_id))
);

CREATE POLICY "Facilitators can manage recurrences"
ON public.eos_meeting_recurrences FOR ALL
USING (
  is_super_admin() OR 
  (tenant_id = get_current_user_tenant() AND 
   (is_eos_admin(auth.uid(), tenant_id) OR can_facilitate_eos(auth.uid(), tenant_id)))
)
WITH CHECK (
  is_super_admin() OR 
  (tenant_id = get_current_user_tenant() AND 
   (is_eos_admin(auth.uid(), tenant_id) OR can_facilitate_eos(auth.uid(), tenant_id)))
);

-- RLS policies for occurrences
CREATE POLICY "Users can view their tenant occurrences"
ON public.eos_meeting_occurrences FOR SELECT
USING (
  is_super_admin() OR 
  (tenant_id = get_current_user_tenant() AND has_any_eos_role(auth.uid(), tenant_id))
);

CREATE POLICY "Facilitators can manage occurrences"
ON public.eos_meeting_occurrences FOR ALL
USING (
  is_super_admin() OR 
  (tenant_id = get_current_user_tenant() AND 
   (is_eos_admin(auth.uid(), tenant_id) OR can_facilitate_eos(auth.uid(), tenant_id)))
)
WITH CHECK (
  is_super_admin() OR 
  (tenant_id = get_current_user_tenant() AND 
   (is_eos_admin(auth.uid(), tenant_id) OR can_facilitate_eos(auth.uid(), tenant_id)))
);

-- Create indexes
CREATE INDEX idx_recurrences_meeting ON public.eos_meeting_recurrences(meeting_id);
CREATE INDEX idx_recurrences_tenant ON public.eos_meeting_recurrences(tenant_id);
CREATE INDEX idx_occurrences_recurrence ON public.eos_meeting_occurrences(recurrence_id);
CREATE INDEX idx_occurrences_meeting ON public.eos_meeting_occurrences(meeting_id);
CREATE INDEX idx_occurrences_tenant_status ON public.eos_meeting_occurrences(tenant_id, status);

-- RPC: Cancel a specific occurrence
CREATE OR REPLACE FUNCTION public.cancel_occurrence(p_occurrence_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_occurrence RECORD;
BEGIN
  SELECT * INTO v_occurrence
  FROM public.eos_meeting_occurrences
  WHERE id = p_occurrence_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Occurrence not found';
  END IF;

  -- Verify permissions
  IF NOT (
    is_super_admin() OR 
    is_eos_admin(auth.uid(), v_occurrence.tenant_id) OR
    can_facilitate_eos(auth.uid(), v_occurrence.tenant_id)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Cancel the occurrence
  UPDATE public.eos_meeting_occurrences
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_occurrence_id;

  -- If there's a linked meeting, mark it as cancelled
  IF v_occurrence.meeting_id IS NOT NULL THEN
    UPDATE public.eos_meetings
    SET is_complete = true, completed_at = now()
    WHERE id = v_occurrence.meeting_id;
  END IF;

  -- Audit log
  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_occurrence.tenant_id, auth.uid(), 'occurrence', p_occurrence_id,
    'cancelled', 'Occurrence cancelled',
    jsonb_build_object('starts_at', v_occurrence.starts_at)
  );
END;
$$;

-- RPC: Cancel all future occurrences in a series
CREATE OR REPLACE FUNCTION public.cancel_recurrence_series(p_recurrence_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recurrence RECORD;
  v_cancelled_count INTEGER := 0;
BEGIN
  SELECT * INTO v_recurrence
  FROM public.eos_meeting_recurrences
  WHERE id = p_recurrence_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurrence not found';
  END IF;

  -- Verify permissions
  IF NOT (
    is_super_admin() OR 
    is_eos_admin(auth.uid(), v_recurrence.tenant_id) OR
    can_facilitate_eos(auth.uid(), v_recurrence.tenant_id)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Cancel all future occurrences
  UPDATE public.eos_meeting_occurrences
  SET status = 'cancelled', updated_at = now()
  WHERE recurrence_id = p_recurrence_id
    AND starts_at > now()
    AND status = 'scheduled';
  
  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

  -- Audit log
  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_recurrence.tenant_id, auth.uid(), 'recurrence', p_recurrence_id,
    'cancelled_series', 'All future occurrences cancelled',
    jsonb_build_object('count', v_cancelled_count)
  );

  RETURN v_cancelled_count;
END;
$$;