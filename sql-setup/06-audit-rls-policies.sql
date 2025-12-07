SET search_path = public, pg_temp;

-- ===================================
-- RLS POLICIES FOR AUDIT TABLES
-- ===================================

-- Helper function: Check if user is in tenant
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

-- ===================================
-- AUDIT TABLE POLICIES
-- ===================================

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

-- ===================================
-- AUDIT SECTION POLICIES
-- ===================================

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

-- ===================================
-- QUESTION BANK POLICIES (GLOBAL)
-- ===================================

CREATE POLICY audit_question_bank_select ON public.audit_question_bank
  FOR SELECT
  USING (active = true OR is_super_admin());

CREATE POLICY audit_question_bank_insert ON public.audit_question_bank
  FOR INSERT
  WITH CHECK (is_super_admin());

CREATE POLICY audit_question_bank_update ON public.audit_question_bank
  FOR UPDATE
  USING (is_super_admin());

-- ===================================
-- AUDIT QUESTION POLICIES
-- ===================================

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

-- ===================================
-- AUDIT RESPONSE POLICIES
-- ===================================

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

-- ===================================
-- FINDING & ACTION POLICIES
-- ===================================

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
