SET search_path = public, pg_temp;

-- ===================================
-- RPC: CREATE AUDIT
-- ===================================

CREATE OR REPLACE FUNCTION public.create_audit(
  p_tenant_id BIGINT,
  p_client_id UUID,
  p_created_by UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_audit_id BIGINT;
  v_section_id BIGINT;
  v_question RECORD;
  v_order_idx INT;
BEGIN
  IF NOT (is_super_admin() OR user_in_tenant(p_tenant_id)) THEN
    RAISE EXCEPTION 'Access denied: user not in tenant';
  END IF;

  INSERT INTO public.audit (tenant_id, client_id, created_by, status)
  VALUES (p_tenant_id, p_client_id, p_created_by, 'draft')
  RETURNING id INTO v_audit_id;

  FOR i IN 1..8 LOOP
    INSERT INTO public.audit_section (audit_id, standard_code, title, order_index)
    VALUES (
      v_audit_id,
      'QA' || i::TEXT,
      'Quality Area ' || i::TEXT,
      i
    )
    RETURNING id INTO v_section_id;

    v_order_idx := 1;
    FOR v_question IN
      SELECT * FROM public.audit_question_bank
      WHERE active = true
      AND quality_area = 'QA' || i::TEXT
      ORDER BY standard_code, id
    LOOP
      INSERT INTO public.audit_question (
        audit_section_id,
        bank_id,
        question_text,
        rating_scale,
        evidence_prompt,
        order_index
      ) VALUES (
        v_section_id,
        v_question.id,
        v_question.question_text,
        v_question.rating_scale,
        v_question.evidence_prompt,
        v_order_idx
      );
      v_order_idx := v_order_idx + 1;
    END LOOP;
  END LOOP;

  RETURN v_audit_id;
END;
$$;

-- ===================================
-- RPC: ADD AUDIT RESPONSE
-- ===================================

CREATE OR REPLACE FUNCTION public.add_audit_response(
  p_audit_question_id BIGINT,
  p_rating TEXT,
  p_notes TEXT DEFAULT NULL,
  p_risk_level TEXT DEFAULT 'none',
  p_tags TEXT[] DEFAULT '{}'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_response_id BIGINT;
  v_audit_id BIGINT;
BEGIN
  SELECT a.id INTO v_audit_id
  FROM public.audit a
  JOIN public.audit_section s ON s.audit_id = a.id
  JOIN public.audit_question q ON q.audit_section_id = s.id
  WHERE q.id = p_audit_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit a
    WHERE a.id = v_audit_id
    AND (is_super_admin() OR user_in_tenant(a.tenant_id))
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.audit_response (
    audit_question_id,
    rating,
    notes,
    risk_level,
    tags,
    created_by
  ) VALUES (
    p_audit_question_id,
    p_rating,
    p_notes,
    p_risk_level,
    p_tags,
    auth.uid()
  )
  ON CONFLICT (audit_question_id) DO UPDATE SET
    rating = EXCLUDED.rating,
    notes = EXCLUDED.notes,
    risk_level = EXCLUDED.risk_level,
    tags = EXCLUDED.tags,
    updated_at = NOW()
  RETURNING id INTO v_response_id;

  RETURN v_response_id;
END;
$$;

-- ===================================
-- RPC: GENERATE FINDINGS
-- ===================================

CREATE OR REPLACE FUNCTION public.generate_findings(
  p_audit_id BIGINT
)
RETURNS TABLE(finding_id BIGINT, priority TEXT, summary TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_response RECORD;
  v_finding_id BIGINT;
  v_priority TEXT;
  v_summary TEXT;
  v_impact TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.audit a
    WHERE a.id = p_audit_id
    AND (is_super_admin() OR user_in_tenant(a.tenant_id))
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM public.audit_finding
  WHERE audit_id = p_audit_id AND auto_generated = true;

  FOR v_response IN
    SELECT
      r.id,
      r.rating,
      r.notes,
      r.risk_level,
      q.id AS question_id,
      q.question_text,
      qb.risk_tags,
      qb.standard_code
    FROM public.audit_response r
    JOIN public.audit_question q ON q.id = r.audit_question_id
    JOIN public.audit_question_bank qb ON qb.id = q.bank_id
    JOIN public.audit_section s ON s.id = q.audit_section_id
    WHERE s.audit_id = p_audit_id
    AND r.rating IN ('non_compliant', 'partially_compliant')
  LOOP
    IF v_response.rating = 'non_compliant' OR v_response.risk_level = 'high' THEN
      v_priority := 'high';
      v_impact := 'Risk to training quality, assessment accuracy, student harm, or registration integrity';
    ELSIF v_response.rating = 'partially_compliant' OR v_response.risk_level = 'medium' THEN
      v_priority := 'medium';
      v_impact := 'Moderate risk to systems or compliance processes';
    ELSE
      v_priority := 'low';
      v_impact := 'Low risk requiring minor improvements';
    END IF;

    v_summary := 'Standard ' || v_response.standard_code || ': ' || v_response.question_text;
    IF v_response.notes IS NOT NULL THEN
      v_summary := v_summary || ' | Notes: ' || v_response.notes;
    END IF;

    INSERT INTO public.audit_finding (
      audit_id,
      question_id,
      summary,
      impact,
      priority,
      auto_generated,
      created_by
    ) VALUES (
      p_audit_id,
      v_response.question_id,
      v_summary,
      v_impact,
      v_priority,
      true,
      auth.uid()
    )
    RETURNING id INTO v_finding_id;

    RETURN QUERY SELECT v_finding_id, v_priority, v_summary;
  END LOOP;
END;
$$;

-- ===================================
-- RPC: CREATE AUDIT ACTION
-- ===================================

CREATE OR REPLACE FUNCTION public.create_audit_action(
  p_finding_id BIGINT,
  p_assigned_to UUID,
  p_due_date DATE,
  p_description TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action_id BIGINT;
  v_audit_id BIGINT;
  v_tenant_id BIGINT;
BEGIN
  SELECT a.id, a.tenant_id INTO v_audit_id, v_tenant_id
  FROM public.audit a
  JOIN public.audit_finding f ON f.audit_id = a.id
  WHERE f.id = p_finding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finding not found';
  END IF;

  IF NOT (is_super_admin() OR user_in_tenant(v_tenant_id)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = p_assigned_to
    AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Cannot assign to user outside tenant';
  END IF;

  INSERT INTO public.audit_action (
    audit_id,
    finding_id,
    assigned_to,
    due_date,
    description,
    created_by
  ) VALUES (
    v_audit_id,
    p_finding_id,
    p_assigned_to,
    p_due_date,
    p_description,
    auth.uid()
  )
  RETURNING id INTO v_action_id;

  RETURN v_action_id;
END;
$$;

-- ===================================
-- RPC: GET AUDIT REPORT
-- ===================================

CREATE OR REPLACE FUNCTION public.get_audit_report(
  p_audit_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_audit RECORD;
  v_sections JSONB;
  v_findings JSONB;
  v_actions JSONB;
  v_risk_summary JSONB;
BEGIN
  SELECT * INTO v_audit FROM public.audit WHERE id = p_audit_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Audit not found';
  END IF;

  IF NOT (is_super_admin() OR user_in_tenant(v_audit.tenant_id)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'section_id', s.id,
      'title', s.title,
      'standard_code', s.standard_code,
      'questions', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'question_id', q.id,
            'question_text', q.question_text,
            'response', (
              SELECT jsonb_build_object(
                'rating', r.rating,
                'notes', r.notes,
                'risk_level', r.risk_level,
                'evidence_files', r.evidence_files
              )
              FROM public.audit_response r
              WHERE r.audit_question_id = q.id
            )
          )
          ORDER BY q.order_index
        )
        FROM public.audit_question q
        WHERE q.audit_section_id = s.id
      )
    )
    ORDER BY s.order_index
  ) INTO v_sections
  FROM public.audit_section s
  WHERE s.audit_id = p_audit_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'finding_id', f.id,
      'summary', f.summary,
      'impact', f.impact,
      'priority', f.priority,
      'created_at', f.created_at
    )
    ORDER BY 
      CASE f.priority
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
      END
  ) INTO v_findings
  FROM public.audit_finding f
  WHERE f.audit_id = p_audit_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'action_id', a.id,
      'description', a.description,
      'assigned_to', a.assigned_to,
      'due_date', a.due_date,
      'status', a.status
    )
  ) INTO v_actions
  FROM public.audit_action a
  WHERE a.audit_id = p_audit_id;

  SELECT jsonb_build_object(
    'high_count', COUNT(*) FILTER (WHERE priority = 'high'),
    'medium_count', COUNT(*) FILTER (WHERE priority = 'medium'),
    'low_count', COUNT(*) FILTER (WHERE priority = 'low'),
    'total_findings', COUNT(*)
  ) INTO v_risk_summary
  FROM public.audit_finding
  WHERE audit_id = p_audit_id;

  v_result := jsonb_build_object(
    'audit', jsonb_build_object(
      'audit_id', v_audit.id,
      'status', v_audit.status,
      'audit_title', v_audit.audit_title,
      'started_at', v_audit.started_at,
      'completed_at', v_audit.completed_at
    ),
    'sections', v_sections,
    'findings', COALESCE(v_findings, '[]'::jsonb),
    'actions', COALESCE(v_actions, '[]'::jsonb),
    'risk_summary', v_risk_summary
  );

  RETURN v_result;
END;
$$;
