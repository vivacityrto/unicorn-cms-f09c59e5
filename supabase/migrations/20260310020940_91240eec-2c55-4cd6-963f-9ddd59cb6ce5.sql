
-- 1. Add meeting_started_at to eos_qc
ALTER TABLE public.eos_qc ADD COLUMN IF NOT EXISTS meeting_started_at TIMESTAMPTZ;

-- 2. Add respondent_role to eos_qc_answers
ALTER TABLE public.eos_qc_answers ADD COLUMN respondent_role TEXT NOT NULL DEFAULT 'manager';

-- Drop old unique constraint, add new one including respondent_role
ALTER TABLE public.eos_qc_answers DROP CONSTRAINT eos_qc_answers_qc_id_section_key_prompt_key_key;
ALTER TABLE public.eos_qc_answers ADD CONSTRAINT eos_qc_answers_qc_section_prompt_role_key 
  UNIQUE (qc_id, section_key, prompt_key, respondent_role);
ALTER TABLE public.eos_qc_answers ADD CONSTRAINT eos_qc_answers_respondent_role_check 
  CHECK (respondent_role IN ('manager', 'reviewee'));

-- 3. Add respondent_role to eos_qc_fit
ALTER TABLE public.eos_qc_fit ADD COLUMN respondent_role TEXT NOT NULL DEFAULT 'manager';

-- Drop old unique constraint, add new one
ALTER TABLE public.eos_qc_fit DROP CONSTRAINT eos_qc_fit_qc_id_key;
ALTER TABLE public.eos_qc_fit ADD CONSTRAINT eos_qc_fit_qc_role_key UNIQUE (qc_id, respondent_role);
ALTER TABLE public.eos_qc_fit ADD CONSTRAINT eos_qc_fit_respondent_role_check 
  CHECK (respondent_role IN ('manager', 'reviewee'));

-- 4. Update qc_upsert_answer to accept respondent_role
CREATE OR REPLACE FUNCTION public.qc_upsert_answer(
  p_qc_id UUID,
  p_section_key TEXT,
  p_prompt_key TEXT,
  p_value_json JSONB,
  p_respondent_role TEXT DEFAULT 'manager'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_answer_id UUID;
  v_tenant_id BIGINT;
BEGIN
  IF NOT can_access_qc(auth.uid(), p_qc_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  IF is_qc_signed(p_qc_id) THEN
    RAISE EXCEPTION 'Cannot modify signed QC';
  END IF;
  
  SELECT tenant_id INTO v_tenant_id
  FROM public.eos_qc
  WHERE id = p_qc_id;
  
  INSERT INTO public.eos_qc_answers (
    qc_id, section_key, prompt_key, value_json, created_by, respondent_role
  ) VALUES (
    p_qc_id, p_section_key, p_prompt_key, p_value_json, auth.uid(), p_respondent_role
  )
  ON CONFLICT (qc_id, section_key, prompt_key, respondent_role) DO UPDATE
  SET value_json = p_value_json,
      updated_at = now()
  RETURNING id INTO v_answer_id;
  
  UPDATE public.eos_qc
  SET status = 'in_progress'
  WHERE id = p_qc_id AND status = 'scheduled';
  
  RETURN v_answer_id;
END;
$$;

-- 5. Update qc_set_fit to accept respondent_role
CREATE OR REPLACE FUNCTION public.qc_set_fit(
  p_qc_id UUID,
  p_gets_it BOOLEAN,
  p_wants_it BOOLEAN,
  p_capacity BOOLEAN,
  p_notes TEXT DEFAULT NULL,
  p_seat_id UUID DEFAULT NULL,
  p_respondent_role TEXT DEFAULT 'manager'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fit_id UUID;
BEGIN
  IF NOT can_access_qc(auth.uid(), p_qc_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  IF is_qc_signed(p_qc_id) THEN
    RAISE EXCEPTION 'Cannot modify signed QC';
  END IF;
  
  INSERT INTO public.eos_qc_fit (
    qc_id, gets_it, wants_it, capacity, notes, seat_id, respondent_role
  ) VALUES (
    p_qc_id, p_gets_it, p_wants_it, p_capacity, p_notes, p_seat_id, p_respondent_role
  )
  ON CONFLICT (qc_id, respondent_role) DO UPDATE
  SET gets_it = p_gets_it,
      wants_it = p_wants_it,
      capacity = p_capacity,
      notes = COALESCE(p_notes, eos_qc_fit.notes),
      seat_id = COALESCE(p_seat_id, eos_qc_fit.seat_id),
      updated_at = now()
  RETURNING id INTO v_fit_id;
  
  RETURN v_fit_id;
END;
$$;

-- 6. New qc_start_meeting function
CREATE OR REPLACE FUNCTION public.qc_start_meeting(
  p_qc_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT can_access_qc(auth.uid(), p_qc_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Only managers can start the meeting
  IF NOT EXISTS (
    SELECT 1 FROM public.eos_qc
    WHERE id = p_qc_id AND auth.uid() = ANY(manager_ids)
  ) THEN
    RAISE EXCEPTION 'Only a manager can start the meeting';
  END IF;
  
  UPDATE public.eos_qc
  SET meeting_started_at = now(),
      status = 'in_progress',
      updated_at = now()
  WHERE id = p_qc_id AND meeting_started_at IS NULL;
END;
$$;
