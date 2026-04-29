-- Wave 4 #1: AI-Suggested Ratings from Uploaded Evidence

ALTER TABLE public.client_audit_responses
  ADD COLUMN IF NOT EXISTS ai_suggested_rating text,
  ADD COLUMN IF NOT EXISTS ai_suggested_notes text,
  ADD COLUMN IF NOT EXISTS ai_confidence numeric,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_analysis_id uuid,
  ADD COLUMN IF NOT EXISTS ai_excerpts jsonb,
  ADD COLUMN IF NOT EXISTS ai_gaps jsonb,
  ADD COLUMN IF NOT EXISTS ai_model text;

CREATE TABLE IF NOT EXISTS public.client_audit_response_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.client_audit_responses(id) ON DELETE CASCADE,
  document_id bigint NOT NULL,
  linked_by uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_card_response ON public.client_audit_response_documents (response_id);
CREATE INDEX IF NOT EXISTS idx_card_document ON public.client_audit_response_documents (document_id);

ALTER TABLE public.client_audit_response_documents ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_card_updated_at ON public.client_audit_response_documents;
CREATE TRIGGER trg_card_updated_at
  BEFORE UPDATE ON public.client_audit_response_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "card_select_staff" ON public.client_audit_response_documents;
CREATE POLICY "card_select_staff"
ON public.client_audit_response_documents FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid())
  AND EXISTS (SELECT 1 FROM public.client_audit_responses r WHERE r.id = client_audit_response_documents.response_id)
);

DROP POLICY IF EXISTS "card_insert_staff" ON public.client_audit_response_documents;
CREATE POLICY "card_insert_staff"
ON public.client_audit_response_documents FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid())
  AND EXISTS (SELECT 1 FROM public.client_audit_responses r WHERE r.id = client_audit_response_documents.response_id)
  AND EXISTS (
    SELECT 1
    FROM public.client_audit_responses r
    JOIN public.client_audits a ON a.id = r.audit_id
    JOIN public.documents d ON d.id = client_audit_response_documents.document_id
    WHERE r.id = client_audit_response_documents.response_id
      AND d.tenant_id = a.subject_tenant_id
  )
);

DROP POLICY IF EXISTS "card_update_staff" ON public.client_audit_response_documents;
CREATE POLICY "card_update_staff"
ON public.client_audit_response_documents FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid())
  AND EXISTS (SELECT 1 FROM public.client_audit_responses r WHERE r.id = client_audit_response_documents.response_id)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid())
  AND EXISTS (SELECT 1 FROM public.client_audit_responses r WHERE r.id = client_audit_response_documents.response_id)
  AND EXISTS (
    SELECT 1
    FROM public.client_audit_responses r
    JOIN public.client_audits a ON a.id = r.audit_id
    JOIN public.documents d ON d.id = client_audit_response_documents.document_id
    WHERE r.id = client_audit_response_documents.response_id
      AND d.tenant_id = a.subject_tenant_id
  )
);

DROP POLICY IF EXISTS "card_delete_staff" ON public.client_audit_response_documents;
CREATE POLICY "card_delete_staff"
ON public.client_audit_response_documents FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid())
  AND EXISTS (SELECT 1 FROM public.client_audit_responses r WHERE r.id = client_audit_response_documents.response_id)
);

CREATE TABLE IF NOT EXISTS public.ai_evidence_analysis_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  usage_date date NOT NULL DEFAULT (now()::date),
  response_id uuid,
  audit_id uuid,
  document_count int,
  model text,
  status text NOT NULL DEFAULT 'success',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aieau_user_date
  ON public.ai_evidence_analysis_usage (user_id, usage_date);

ALTER TABLE public.ai_evidence_analysis_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aieau_select_own" ON public.ai_evidence_analysis_usage;
CREATE POLICY "aieau_select_own"
ON public.ai_evidence_analysis_usage FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "aieau_insert_own" ON public.ai_evidence_analysis_usage;
CREATE POLICY "aieau_insert_own"
ON public.ai_evidence_analysis_usage FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());