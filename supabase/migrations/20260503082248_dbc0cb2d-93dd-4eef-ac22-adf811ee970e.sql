
-- 1. client_audit_response_documents: restrict the staff policies to actual Vivacity staff
DROP POLICY IF EXISTS "card_select_staff" ON public.client_audit_response_documents;
DROP POLICY IF EXISTS "card_insert_staff" ON public.client_audit_response_documents;
DROP POLICY IF EXISTS "card_update_staff" ON public.client_audit_response_documents;
DROP POLICY IF EXISTS "card_delete_staff" ON public.client_audit_response_documents;

CREATE POLICY "card_select_vivacity_staff"
ON public.client_audit_response_documents
FOR SELECT
USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "card_insert_vivacity_staff"
ON public.client_audit_response_documents
FOR INSERT
WITH CHECK (
  is_vivacity_team_safe(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM client_audit_responses r
    JOIN client_audits a ON a.id = r.audit_id
    JOIN documents d ON d.id = client_audit_response_documents.document_id
    WHERE r.id = client_audit_response_documents.response_id
      AND d.tenant_id = a.subject_tenant_id
  )
);

CREATE POLICY "card_update_vivacity_staff"
ON public.client_audit_response_documents
FOR UPDATE
USING (is_vivacity_team_safe(auth.uid()))
WITH CHECK (
  is_vivacity_team_safe(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM client_audit_responses r
    JOIN client_audits a ON a.id = r.audit_id
    JOIN documents d ON d.id = client_audit_response_documents.document_id
    WHERE r.id = client_audit_response_documents.response_id
      AND d.tenant_id = a.subject_tenant_id
  )
);

CREATE POLICY "card_delete_vivacity_staff"
ON public.client_audit_response_documents
FOR DELETE
USING (is_vivacity_team_safe(auth.uid()));

-- 2. research_sources: require tenant access on the parent job
DROP POLICY IF EXISTS "read_research_sources_via_job" ON public.research_sources;

CREATE POLICY "read_research_sources_via_job"
ON public.research_sources
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM research_jobs j
    WHERE j.id = research_sources.job_id
      AND (
        is_vivacity_team_safe(auth.uid())
        OR has_tenant_access_safe(j.tenant_id, auth.uid())
      )
  )
);

-- 3. ai_event_payloads: restrict to Vivacity staff
DROP POLICY IF EXISTS "vivacity_staff_select_ai_event_payloads" ON public.ai_event_payloads;

CREATE POLICY "vivacity_staff_select_ai_event_payloads"
ON public.ai_event_payloads
FOR SELECT
USING (is_vivacity_team_safe(auth.uid()));

-- 4. document_data_sources: scope reads via owning document's tenant
DROP POLICY IF EXISTS "document_data_sources_staff_select" ON public.document_data_sources;

CREATE POLICY "document_data_sources_staff_select"
ON public.document_data_sources
FOR SELECT
USING (
  is_vivacity_team_safe(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM documents d
    WHERE d.id = document_data_sources.document_id
      AND has_tenant_access_safe(d.tenant_id, auth.uid())
  )
);

-- 5. document_ai_audit: scope reads via owning document's tenant
DROP POLICY IF EXISTS "document_ai_audit_users_select" ON public.document_ai_audit;

CREATE POLICY "document_ai_audit_users_select"
ON public.document_ai_audit
FOR SELECT
USING (
  is_vivacity_team_safe(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM documents d
    WHERE d.id = document_ai_audit.document_id
      AND has_tenant_access_safe(d.tenant_id, auth.uid())
  )
);

-- 6. compliance_template_sections + questions: scope to parent template's tenant
DROP POLICY IF EXISTS "compliance_sections_read" ON public.compliance_template_sections;

CREATE POLICY "compliance_sections_read"
ON public.compliance_template_sections
FOR SELECT
USING (
  is_vivacity_team_safe(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM compliance_templates t
    WHERE t.id = compliance_template_sections.template_id
      AND (
        t.tenant_id IS NULL
        OR has_tenant_access_safe(t.tenant_id, auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "compliance_questions_read" ON public.compliance_template_questions;

CREATE POLICY "compliance_questions_read"
ON public.compliance_template_questions
FOR SELECT
USING (
  is_vivacity_team_safe(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM compliance_template_sections s
    JOIN compliance_templates t ON t.id = s.template_id
    WHERE s.id = compliance_template_questions.section_id
      AND (
        t.tenant_id IS NULL
        OR has_tenant_access_safe(t.tenant_id, auth.uid())
      )
  )
);
