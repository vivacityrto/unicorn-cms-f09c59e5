-- =====================================================
-- EOS Quarterly Conversations - RPC Functions (Fixed)
-- =====================================================

-- =====================================================
-- 1. SCHEDULE A NEW QC
-- =====================================================
CREATE OR REPLACE FUNCTION public.qc_schedule(
  p_reviewee_id UUID,
  p_manager_ids UUID[],
  p_template_id UUID,
  p_quarter_start DATE,
  p_quarter_end DATE,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qc_id UUID;
  v_tenant_id BIGINT;
BEGIN
  -- Get tenant from current user
  SELECT tenant_id INTO v_tenant_id
  FROM public.users
  WHERE user_uuid = auth.uid();
  
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'User must belong to a tenant';
  END IF;
  
  -- Verify user is manager or admin
  IF NOT (
    auth.uid() = ANY(p_manager_ids)
    OR is_eos_admin(auth.uid(), v_tenant_id)
    OR is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Only managers or admins can schedule QCs';
  END IF;
  
  -- Create QC
  INSERT INTO public.eos_qc (
    tenant_id,
    reviewee_id,
    manager_ids,
    template_id,
    quarter_start,
    quarter_end,
    scheduled_at,
    status,
    created_by
  ) VALUES (
    v_tenant_id,
    p_reviewee_id,
    p_manager_ids,
    p_template_id,
    p_quarter_start,
    p_quarter_end,
    COALESCE(p_scheduled_at, now()),
    'scheduled',
    auth.uid()
  ) RETURNING id INTO v_qc_id;
  
  -- Audit log
  INSERT INTO public.audit_eos_events (
    tenant_id,
    user_id,
    entity,
    entity_id,
    action,
    reason,
    details
  ) VALUES (
    v_tenant_id,
    auth.uid(),
    'qc',
    v_qc_id,
    'scheduled',
    'Quarterly Conversation scheduled',
    jsonb_build_object(
      'reviewee_id', p_reviewee_id,
      'manager_count', array_length(p_manager_ids, 1),
      'quarter_start', p_quarter_start,
      'quarter_end', p_quarter_end
    )
  );
  
  RETURN v_qc_id;
END;
$$;

-- =====================================================
-- 2. UPSERT AN ANSWER (FIXED)
-- =====================================================
CREATE OR REPLACE FUNCTION public.qc_upsert_answer(
  p_qc_id UUID,
  p_section_key TEXT,
  p_prompt_key TEXT,
  p_value_json JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_answer_id UUID;
  v_tenant_id BIGINT;
BEGIN
  -- Verify access
  IF NOT can_access_qc(auth.uid(), p_qc_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Check if QC is signed
  IF is_qc_signed(p_qc_id) THEN
    RAISE EXCEPTION 'Cannot modify signed QC';
  END IF;
  
  -- Get tenant_id
  SELECT tenant_id INTO v_tenant_id
  FROM public.eos_qc
  WHERE id = p_qc_id;
  
  -- Upsert answer
  INSERT INTO public.eos_qc_answers (
    qc_id,
    section_key,
    prompt_key,
    value_json,
    created_by
  ) VALUES (
    p_qc_id,
    p_section_key,
    p_prompt_key,
    p_value_json,
    auth.uid()
  )
  ON CONFLICT (qc_id, section_key, prompt_key) DO UPDATE
  SET value_json = p_value_json,
      updated_at = now()
  RETURNING id INTO v_answer_id;
  
  -- Update QC status to in_progress if still scheduled
  UPDATE public.eos_qc
  SET status = 'in_progress'
  WHERE id = p_qc_id AND status = 'scheduled';
  
  RETURN v_answer_id;
END;
$$;

-- =====================================================
-- 3. SET GWC FIT DATA
-- =====================================================
CREATE OR REPLACE FUNCTION public.qc_set_fit(
  p_qc_id UUID,
  p_gets_it BOOLEAN,
  p_wants_it BOOLEAN,
  p_capacity BOOLEAN,
  p_notes TEXT DEFAULT NULL,
  p_seat_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fit_id UUID;
BEGIN
  -- Verify access
  IF NOT can_access_qc(auth.uid(), p_qc_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Check if QC is signed
  IF is_qc_signed(p_qc_id) THEN
    RAISE EXCEPTION 'Cannot modify signed QC';
  END IF;
  
  -- Upsert fit data
  INSERT INTO public.eos_qc_fit (
    qc_id,
    gets_it,
    wants_it,
    capacity,
    notes,
    seat_id
  ) VALUES (
    p_qc_id,
    p_gets_it,
    p_wants_it,
    p_capacity,
    p_notes,
    p_seat_id
  )
  ON CONFLICT (qc_id) DO UPDATE
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

-- =====================================================
-- 4. CREATE LINKS TO ROCKS/ISSUES/TODOS
-- =====================================================
CREATE OR REPLACE FUNCTION public.qc_create_links(
  p_qc_id UUID,
  p_links JSONB
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_link JSONB;
  v_link_id UUID;
  v_created_ids UUID[] := '{}';
  v_qc RECORD;
  v_rock_id UUID;
  v_issue_id UUID;
  v_todo_id UUID;
BEGIN
  -- Verify access
  IF NOT can_access_qc(auth.uid(), p_qc_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Get QC details
  SELECT * INTO v_qc
  FROM public.eos_qc
  WHERE id = p_qc_id;
  
  -- Process each link
  FOR v_link IN SELECT * FROM jsonb_array_elements(p_links)
  LOOP
    -- Create entity based on type
    IF (v_link->>'type') = 'rock' THEN
      INSERT INTO public.eos_rocks (
        tenant_id,
        title,
        description,
        owner_id,
        quarter_year,
        quarter_number,
        due_date,
        status,
        priority,
        created_by
      ) VALUES (
        v_qc.tenant_id,
        v_link->>'title',
        v_link->>'description',
        (v_link->>'owner_id')::UUID,
        EXTRACT(YEAR FROM v_qc.quarter_start)::INT,
        CEIL(EXTRACT(MONTH FROM v_qc.quarter_start) / 3.0)::INT,
        (v_link->>'due_date')::DATE,
        'not_started',
        0,
        auth.uid()
      ) RETURNING id INTO v_rock_id;
      
      INSERT INTO public.eos_qc_links (qc_id, linked_type, linked_id, created_by)
      VALUES (p_qc_id, 'rock', v_rock_id, auth.uid());
      
      v_created_ids := array_append(v_created_ids, v_rock_id);
      
    ELSIF (v_link->>'type') = 'issue' THEN
      INSERT INTO public.eos_issues (
        tenant_id,
        title,
        description,
        status,
        priority,
        assigned_to,
        created_by
      ) VALUES (
        v_qc.tenant_id,
        v_link->>'title',
        v_link->>'description',
        'Open',
        COALESCE((v_link->>'priority')::INT, 0),
        (v_link->>'owner_id')::UUID,
        auth.uid()
      ) RETURNING id INTO v_issue_id;
      
      INSERT INTO public.eos_qc_links (qc_id, linked_type, linked_id, created_by)
      VALUES (p_qc_id, 'issue', v_issue_id, auth.uid());
      
      v_created_ids := array_append(v_created_ids, v_issue_id);
      
    ELSIF (v_link->>'type') = 'todo' THEN
      INSERT INTO public.eos_todos (
        tenant_id,
        title,
        description,
        owner_id,
        assigned_to,
        due_date,
        status,
        created_by
      ) VALUES (
        v_qc.tenant_id,
        v_link->>'title',
        v_link->>'description',
        (v_link->>'owner_id')::UUID,
        (v_link->>'owner_id')::UUID,
        (v_link->>'due_date')::DATE,
        'Open',
        auth.uid()
      ) RETURNING id INTO v_todo_id;
      
      INSERT INTO public.eos_qc_links (qc_id, linked_type, linked_id, created_by)
      VALUES (p_qc_id, 'todo', v_todo_id, auth.uid());
      
      v_created_ids := array_append(v_created_ids, v_todo_id);
    END IF;
  END LOOP;
  
  -- Audit log
  INSERT INTO public.audit_eos_events (
    tenant_id,
    user_id,
    entity,
    entity_id,
    action,
    reason,
    details
  ) VALUES (
    v_qc.tenant_id,
    auth.uid(),
    'qc',
    p_qc_id,
    'links_created',
    'Action items created from QC',
    jsonb_build_object(
      'count', array_length(v_created_ids, 1),
      'created_ids', v_created_ids
    )
  );
  
  RETURN v_created_ids;
END;
$$;

-- =====================================================
-- 5. SIGN THE QC
-- =====================================================
CREATE OR REPLACE FUNCTION public.qc_sign(
  p_qc_id UUID,
  p_role TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qc RECORD;
  v_is_fully_signed BOOLEAN;
BEGIN
  -- Verify access
  IF NOT can_access_qc(auth.uid(), p_qc_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Get QC
  SELECT * INTO v_qc
  FROM public.eos_qc
  WHERE id = p_qc_id;
  
  -- Verify role matches user
  IF p_role = 'reviewee' AND v_qc.reviewee_id != auth.uid() THEN
    RAISE EXCEPTION 'Only reviewee can sign as reviewee';
  END IF;
  
  IF p_role = 'manager' AND NOT (auth.uid() = ANY(v_qc.manager_ids)) THEN
    RAISE EXCEPTION 'Only manager can sign as manager';
  END IF;
  
  -- Check if already signed
  IF EXISTS (
    SELECT 1 FROM public.eos_qc_signoffs
    WHERE qc_id = p_qc_id AND signed_by = auth.uid() AND role = p_role
  ) THEN
    RAISE EXCEPTION 'Already signed';
  END IF;
  
  -- Record signature
  INSERT INTO public.eos_qc_signoffs (qc_id, signed_by, role)
  VALUES (p_qc_id, auth.uid(), p_role);
  
  -- Check if both parties have signed
  SELECT is_qc_signed(p_qc_id) INTO v_is_fully_signed;
  
  -- If fully signed, mark QC as completed
  IF v_is_fully_signed THEN
    UPDATE public.eos_qc
    SET status = 'completed',
        completed_at = now()
    WHERE id = p_qc_id;
  END IF;
  
  -- Audit log
  INSERT INTO public.audit_eos_events (
    tenant_id,
    user_id,
    entity,
    entity_id,
    action,
    reason,
    details
  ) VALUES (
    v_qc.tenant_id,
    auth.uid(),
    'qc',
    p_qc_id,
    'signed',
    'QC signed by ' || p_role,
    jsonb_build_object(
      'role', p_role,
      'fully_signed', v_is_fully_signed
    )
  );
  
  RETURN v_is_fully_signed;
END;
$$;

-- =====================================================
-- 6. SCHEDULE NEXT QC
-- =====================================================
CREATE OR REPLACE FUNCTION public.qc_schedule_next(
  p_current_qc_id UUID,
  p_next_quarter_start DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_qc RECORD;
  v_next_qc_id UUID;
  v_next_start DATE;
  v_next_end DATE;
BEGIN
  -- Verify access
  IF NOT can_access_qc(auth.uid(), p_current_qc_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Get current QC
  SELECT * INTO v_current_qc
  FROM public.eos_qc
  WHERE id = p_current_qc_id;
  
  -- Calculate next quarter dates
  v_next_start := COALESCE(p_next_quarter_start, v_current_qc.quarter_end + INTERVAL '1 day');
  v_next_end := v_next_start + INTERVAL '3 months' - INTERVAL '1 day';
  
  -- Create next QC
  INSERT INTO public.eos_qc (
    tenant_id,
    reviewee_id,
    manager_ids,
    template_id,
    quarter_start,
    quarter_end,
    scheduled_at,
    status,
    created_by
  ) VALUES (
    v_current_qc.tenant_id,
    v_current_qc.reviewee_id,
    v_current_qc.manager_ids,
    v_current_qc.template_id,
    v_next_start,
    v_next_end,
    v_next_start,
    'scheduled',
    auth.uid()
  ) RETURNING id INTO v_next_qc_id;
  
  -- Audit log
  INSERT INTO public.audit_eos_events (
    tenant_id,
    user_id,
    entity,
    entity_id,
    action,
    reason,
    details
  ) VALUES (
    v_current_qc.tenant_id,
    auth.uid(),
    'qc',
    v_next_qc_id,
    'scheduled_next',
    'Next QC scheduled automatically',
    jsonb_build_object(
      'previous_qc_id', p_current_qc_id,
      'quarter_start', v_next_start,
      'quarter_end', v_next_end
    )
  );
  
  RETURN v_next_qc_id;
END;
$$;