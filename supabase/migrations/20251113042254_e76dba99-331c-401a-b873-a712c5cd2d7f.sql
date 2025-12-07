-- ===================================
-- AUDIT SCHEMA SETUP
-- ===================================
SET search_path = public, pg_temp;

-- ===================================
-- AUDIT CORE TABLES
-- ===================================

CREATE TABLE IF NOT EXISTS public.audit (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients_legacy(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'complete')),
  audit_title TEXT NOT NULL DEFAULT 'Compliance Health Check – SRTOs 2025',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_section (
  id BIGSERIAL PRIMARY KEY,
  audit_id BIGINT NOT NULL REFERENCES public.audit(id) ON DELETE CASCADE,
  standard_code TEXT NOT NULL,
  title TEXT NOT NULL,
  order_index INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_question_bank (
  id BIGSERIAL PRIMARY KEY,
  standard_code TEXT NOT NULL,
  quality_area TEXT NOT NULL,
  performance_indicator TEXT NOT NULL,
  question_text TEXT NOT NULL,
  rating_scale JSONB NOT NULL DEFAULT '["compliant", "minor_issue", "major_risk", "not_applicable"]'::jsonb,
  evidence_prompt TEXT NOT NULL,
  risk_tags TEXT[] NOT NULL DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(standard_code, question_text, version)
);

CREATE TABLE IF NOT EXISTS public.audit_question (
  id BIGSERIAL PRIMARY KEY,
  audit_section_id BIGINT NOT NULL REFERENCES public.audit_section(id) ON DELETE CASCADE,
  bank_id BIGINT NOT NULL REFERENCES public.audit_question_bank(id) ON DELETE RESTRICT,
  question_text TEXT NOT NULL,
  rating_scale JSONB NOT NULL,
  evidence_prompt TEXT NOT NULL,
  order_index INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_response (
  id BIGSERIAL PRIMARY KEY,
  audit_question_id BIGINT NOT NULL REFERENCES public.audit_question(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('compliant', 'partially_compliant', 'non_compliant', 'not_applicable')),
  notes TEXT,
  risk_level TEXT NOT NULL DEFAULT 'none' CHECK (risk_level IN ('high', 'medium', 'low', 'none')),
  tags TEXT[] DEFAULT '{}',
  evidence_files TEXT[] DEFAULT '{}',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(audit_question_id)
);

CREATE TABLE IF NOT EXISTS public.audit_finding (
  id BIGSERIAL PRIMARY KEY,
  audit_id BIGINT NOT NULL REFERENCES public.audit(id) ON DELETE CASCADE,
  question_id BIGINT REFERENCES public.audit_question(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  impact TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  auto_generated BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_action (
  id BIGSERIAL PRIMARY KEY,
  audit_id BIGINT NOT NULL REFERENCES public.audit(id) ON DELETE CASCADE,
  finding_id BIGINT REFERENCES public.audit_finding(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
  description TEXT NOT NULL,
  task_id UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===================================
-- INDEXES
-- ===================================

CREATE INDEX IF NOT EXISTS idx_audit_tenant_id ON public.audit(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_client_id ON public.audit(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_status ON public.audit(status);
CREATE INDEX IF NOT EXISTS idx_audit_section_audit_id ON public.audit_section(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_question_bank_standard_code ON public.audit_question_bank(standard_code);
CREATE INDEX IF NOT EXISTS idx_audit_question_bank_active ON public.audit_question_bank(active);
CREATE INDEX IF NOT EXISTS idx_audit_question_section_id ON public.audit_question(audit_section_id);
CREATE INDEX IF NOT EXISTS idx_audit_response_question_id ON public.audit_response(audit_question_id);
CREATE INDEX IF NOT EXISTS idx_audit_finding_audit_id ON public.audit_finding(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_action_audit_id ON public.audit_action(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_action_assigned_to ON public.audit_action(assigned_to);

-- ===================================
-- ENABLE RLS
-- ===================================

ALTER TABLE public.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_section ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_question ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_response ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_finding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_action ENABLE ROW LEVEL SECURITY;

-- ===================================
-- GRANT PERMISSIONS
-- ===================================

GRANT ALL ON public.audit TO authenticated;
GRANT ALL ON public.audit_section TO authenticated;
GRANT ALL ON public.audit_question_bank TO authenticated;
GRANT ALL ON public.audit_question TO authenticated;
GRANT ALL ON public.audit_response TO authenticated;
GRANT ALL ON public.audit_finding TO authenticated;
GRANT ALL ON public.audit_action TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ===================================
-- RLS POLICIES
-- ===================================

CREATE OR REPLACE FUNCTION public.user_in_tenant(p_tenant_id BIGINT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = auth.uid()
    AND tenant_id = p_tenant_id
  );
$$;

CREATE POLICY audit_select ON public.audit
  FOR SELECT
  USING (
    is_super_admin() OR user_in_tenant(tenant_id)
  );

CREATE POLICY audit_insert ON public.audit
  FOR INSERT
  WITH CHECK (
    user_in_tenant(tenant_id) AND created_by = auth.uid()
  );

CREATE POLICY audit_update ON public.audit
  FOR UPDATE
  USING (user_in_tenant(tenant_id))
  WITH CHECK (user_in_tenant(tenant_id));

CREATE POLICY audit_delete ON public.audit
  FOR DELETE
  USING (is_super_admin());

CREATE POLICY audit_section_select ON public.audit_section
  FOR SELECT
  USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM public.audit a
      WHERE a.id = audit_section.audit_id
      AND user_in_tenant(a.tenant_id)
    )
  );

CREATE POLICY audit_section_insert ON public.audit_section
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.audit a
      WHERE a.id = audit_section.audit_id
      AND user_in_tenant(a.tenant_id)
    )
  );

CREATE POLICY audit_question_bank_select ON public.audit_question_bank
  FOR SELECT
  USING (active = true OR is_super_admin());

CREATE POLICY audit_question_bank_insert ON public.audit_question_bank
  FOR INSERT
  WITH CHECK (is_super_admin());

CREATE POLICY audit_question_bank_update ON public.audit_question_bank
  FOR UPDATE
  USING (is_super_admin());

CREATE POLICY audit_question_select ON public.audit_question
  FOR SELECT
  USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM public.audit_section s
      JOIN public.audit a ON a.id = s.audit_id
      WHERE s.id = audit_question.audit_section_id
      AND user_in_tenant(a.tenant_id)
    )
  );

CREATE POLICY audit_question_insert ON public.audit_question
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.audit_section s
      JOIN public.audit a ON a.id = s.audit_id
      WHERE s.id = audit_question.audit_section_id
      AND user_in_tenant(a.tenant_id)
    )
  );

CREATE POLICY audit_response_select ON public.audit_response
  FOR SELECT
  USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM public.audit_question q
      JOIN public.audit_section s ON s.id = q.audit_section_id
      JOIN public.audit a ON a.id = s.audit_id
      WHERE q.id = audit_response.audit_question_id
      AND user_in_tenant(a.tenant_id)
    )
  );

CREATE POLICY audit_response_insert ON public.audit_response
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.audit_question q
      JOIN public.audit_section s ON s.id = q.audit_section_id
      JOIN public.audit a ON a.id = s.audit_id
      WHERE q.id = audit_response.audit_question_id
      AND user_in_tenant(a.tenant_id)
    )
  );

CREATE POLICY audit_response_update ON public.audit_response
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.audit_question q
      JOIN public.audit_section s ON s.id = q.audit_section_id
      JOIN public.audit a ON a.id = s.audit_id
      WHERE q.id = audit_response.audit_question_id
      AND user_in_tenant(a.tenant_id)
    )
  );

CREATE POLICY audit_finding_select ON public.audit_finding
  FOR SELECT
  USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM public.audit a
      WHERE a.id = audit_finding.audit_id
      AND user_in_tenant(a.tenant_id)
    )
  );

CREATE POLICY audit_finding_insert ON public.audit_finding
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.audit a
      WHERE a.id = audit_finding.audit_id
      AND user_in_tenant(a.tenant_id)
    )
  );

CREATE POLICY audit_finding_update ON public.audit_finding
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.audit a
      WHERE a.id = audit_finding.audit_id
      AND user_in_tenant(a.tenant_id)
    )
  );

CREATE POLICY audit_action_select ON public.audit_action
  FOR SELECT
  USING (
    is_super_admin() OR 
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.audit a
      WHERE a.id = audit_action.audit_id
      AND user_in_tenant(a.tenant_id)
    )
  );

CREATE POLICY audit_action_insert ON public.audit_action
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.audit a
      JOIN public.users u ON u.user_uuid = audit_action.assigned_to
      WHERE a.id = audit_action.audit_id
      AND user_in_tenant(a.tenant_id)
      AND u.tenant_id = a.tenant_id
    )
  );

CREATE POLICY audit_action_update ON public.audit_action
  FOR UPDATE
  USING (
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.audit a
      WHERE a.id = audit_action.audit_id
      AND user_in_tenant(a.tenant_id)
    )
  );

-- ===================================
-- RPC FUNCTIONS
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

-- ===================================
-- SEED AUDIT QUESTION BANK
-- ===================================

INSERT INTO public.audit_question_bank (standard_code, quality_area, performance_indicator, question_text, evidence_prompt, risk_tags, version) VALUES
('1.1', 'QA1', 'Training is consistent with the requirements of the training product', 
 'Demonstrate how training aligns with performance criteria and assessment requirements',
 'TAS, mapping documents, session plans, delivery resources',
 ARRAY['training_integrity', 'student_progress'], 1),

('1.1', 'QA1', 'Training delivery matches approved training package requirements',
 'Show evidence that training content covers all units of competency',
 'Training materials, unit mapping, delivery schedules',
 ARRAY['training_integrity'], 1),

('1.2', 'QA1', 'Trainers and assessors meet required qualifications',
 'Provide evidence of trainer/assessor qualifications and industry currency',
 'Qualifications, professional development records, industry experience',
 ARRAY['credential_compliance', 'quality_training'], 1),

('1.3', 'QA1', 'Assessment meets requirements of the training package',
 'Demonstrate assessment tools are valid, reliable, fair, and flexible',
 'Assessment tools, validation records, moderation evidence',
 ARRAY['assessment_integrity', 'student_outcomes'], 1),

('1.4', 'QA1', 'Assessment is conducted by qualified assessors',
 'Show all assessors hold required qualifications and maintain competency',
 'Assessor qualifications, competency evidence, PD records',
 ARRAY['credential_compliance', 'assessment_integrity'], 1),

('1.5', 'QA1', 'Assessment decisions are valid, reliable, and fair',
 'Evidence assessment judgments are consistent and defensible',
 'Moderation records, validation evidence, appeal outcomes',
 ARRAY['assessment_integrity', 'student_harm'], 1),

('1.6', 'QA1', 'Assessment materials are appropriate and accessible',
 'Show assessment is fit for purpose and reasonable adjustments are made',
 'Assessment tools, LLN support evidence, adjustment records',
 ARRAY['student_access', 'equity'], 1),

('1.7', 'QA1', 'Systematic validation is conducted',
 'Provide evidence of validation schedule and implementation',
 'Validation plans, reports, corrective actions',
 ARRAY['quality_assurance', 'assessment_integrity'], 1),

('1.8', 'QA1', 'Assessment system integrity is maintained',
 'Demonstrate controls to prevent cheating, plagiarism, and collusion',
 'Integrity policies, detection processes, incident records',
 ARRAY['assessment_integrity', 'student_harm', 'registration_integrity'], 1),

('2.1', 'QA2', 'Students receive pre-enrollment information',
 'Show students receive accurate information before enrollment',
 'Marketing materials, pre-enrollment information, USI advice',
 ARRAY['student_information', 'consumer_protection'], 1),

('2.2', 'QA2', 'Students are properly informed and supported',
 'Demonstrate students understand their rights and have access to support',
 'Student handbook, support services, complaint records',
 ARRAY['student_support', 'consumer_protection'], 1),

('2.3', 'QA2', 'Welfare and guidance services are available',
 'Show appropriate support services are accessible to students',
 'Support service records, referral processes, student feedback',
 ARRAY['student_support', 'student_harm'], 1),

('2.4', 'QA2', 'Learning resources are appropriate and accessible',
 'Demonstrate learning resources meet student needs',
 'Learning materials, LMS access, resource adequacy evidence',
 ARRAY['student_support', 'training_quality'], 1),

('2.5', 'QA2', 'Complaints and appeals are handled appropriately',
 'Show effective complaints and appeals procedures',
 'Complaints register, resolution records, policy documents',
 ARRAY['consumer_protection', 'student_support'], 1),

('3.1', 'QA3', 'Governance and administration systems are effective',
 'Demonstrate effective governance structures and administrative processes',
 'Governance documents, policies, administrative records',
 ARRAY['governance', 'compliance_systems'], 1),

('3.2', 'QA3', 'Student records are accurate and secure',
 'Show student records are maintained securely and accurately',
 'Record management system, security measures, accuracy checks',
 ARRAY['data_security', 'student_records', 'registration_integrity'], 1),

('3.3', 'QA3', 'Continuous improvement processes are in place',
 'Evidence of systematic review and improvement activities',
 'CI plans, review records, improvement actions',
 ARRAY['quality_assurance', 'continuous_improvement'], 1),

('4.1', 'QA4', 'Financial management is sound',
 'Demonstrate financial viability and appropriate financial controls',
 'Financial statements, budgets, audit reports',
 ARRAY['financial_viability', 'governance'], 1),

('5.1', 'QA5', 'Marketing information is accurate',
 'Show marketing materials are truthful and not misleading',
 'Marketing materials, website content, advertising',
 ARRAY['consumer_protection', 'student_information'], 1),

('6.1', 'QA6', 'Third party arrangements are properly managed',
 'Demonstrate oversight of third party delivery',
 'Partnership agreements, monitoring records, quality assurance evidence',
 ARRAY['third_party_risk', 'quality_assurance'], 1),

('7.1', 'QA7', 'Pathways and credit transfer are appropriate',
 'Show effective pathway and credit arrangements',
 'Credit policies, articulation agreements, pathway evidence',
 ARRAY['student_pathways', 'compliance'], 1),

('8.1', 'QA8', 'Regulatory requirements are met',
 'Demonstrate compliance with all regulatory obligations',
 'Compliance register, audit reports, rectification evidence',
 ARRAY['regulatory_compliance', 'registration_integrity'], 1)
ON CONFLICT (standard_code, question_text, version) DO NOTHING;