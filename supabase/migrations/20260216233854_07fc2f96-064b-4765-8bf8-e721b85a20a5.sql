
-- Phase L1/L2: Structured Evidence Upload & CSC Review Mode

-- 1) Add required_metadata_json and document_type to stage_required_evidence_categories
ALTER TABLE public.stage_required_evidence_categories
  ADD COLUMN IF NOT EXISTS required_metadata_json JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'policy';

-- Update existing categories with metadata requirements
UPDATE public.stage_required_evidence_categories
SET required_metadata_json = '[{"key":"qualification_list","label":"Qualification List","type":"text","required":true},{"key":"trainer_names","label":"Trainer Names","type":"text","required":true},{"key":"currency_confirmed","label":"Currency Confirmation","type":"boolean","required":true}]'::jsonb
WHERE category_name = 'Trainer and Assessor Matrix';

UPDATE public.stage_required_evidence_categories
SET required_metadata_json = '[{"key":"unit_codes","label":"Unit Codes Covered","type":"text","required":true},{"key":"validation_date","label":"Last Validation Date","type":"date","required":true}]'::jsonb
WHERE category_name = 'Assessment Tools';

-- 2) Add evidence metadata columns to portal_documents
ALTER TABLE public.portal_documents
  ADD COLUMN IF NOT EXISTS evidence_category_id UUID REFERENCES public.stage_required_evidence_categories(id),
  ADD COLUMN IF NOT EXISTS evidence_metadata_json JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS document_type TEXT,
  ADD COLUMN IF NOT EXISTS version_date DATE,
  ADD COLUMN IF NOT EXISTS document_owner TEXT,
  ADD COLUMN IF NOT EXISTS related_qualification TEXT,
  ADD COLUMN IF NOT EXISTS ai_suggested_category_id UUID REFERENCES public.stage_required_evidence_categories(id),
  ADD COLUMN IF NOT EXISTS ai_category_confirmed BOOLEAN DEFAULT false;

-- 3) Create CSC tenant review sessions table
CREATE TABLE IF NOT EXISTS public.tenant_review_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id),
  reviewer_user_id UUID NOT NULL,
  review_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  review_completed_at TIMESTAMPTZ,
  review_mode TEXT NOT NULL DEFAULT 'risk_first',
  summary_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_review_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vivacity_team_manage_reviews"
  ON public.tenant_review_sessions
  FOR ALL TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- 4) Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_portal_docs_evidence_category ON public.portal_documents(evidence_category_id);
CREATE INDEX IF NOT EXISTS idx_portal_docs_tenant_evidence ON public.portal_documents(tenant_id, evidence_category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_review_sessions_tenant ON public.tenant_review_sessions(tenant_id, review_started_at DESC);

-- 5) Audit log function for evidence uploads
CREATE OR REPLACE FUNCTION public.fn_audit_evidence_upload()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_dashboard_events (
    actor_user_id, action, tenant_id, metadata_json
  ) VALUES (
    COALESCE(NEW.uploaded_by, auth.uid()::text),
    'evidence_uploaded',
    NEW.tenant_id,
    jsonb_build_object(
      'document_id', NEW.id,
      'evidence_category_id', NEW.evidence_category_id,
      'document_type', NEW.document_type,
      'has_metadata', (NEW.evidence_metadata_json IS NOT NULL AND NEW.evidence_metadata_json != '{}'::jsonb)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_audit_evidence_upload
  AFTER INSERT ON public.portal_documents
  FOR EACH ROW
  WHEN (NEW.evidence_category_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_audit_evidence_upload();
