-- =====================================================
-- FIX 1: Enable RLS on all client_audit_* tables
-- =====================================================

ALTER TABLE public.client_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_audit_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_audit_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_audit_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_audit_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_audit_documents ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- FIX 2: Replace overly permissive storage policies
-- =====================================================

-- Drop existing overly permissive policies for audit-documents
DROP POLICY IF EXISTS "Authenticated users can upload audit documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view audit documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete audit documents" ON storage.objects;

-- Drop existing overly permissive policies for compliance-evidence
DROP POLICY IF EXISTS "Authenticated users can upload compliance evidence" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view compliance evidence" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update compliance evidence" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete compliance evidence" ON storage.objects;

-- audit-documents: Staff or tenant members can view
CREATE POLICY "audit_docs_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'audit-documents'
  AND (
    public.is_vivacity_team_safe(auth.uid())
    OR public.has_tenant_access_safe((storage.foldername(name))[1]::bigint, auth.uid())
  )
);

-- audit-documents: Staff can upload
CREATE POLICY "audit_docs_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'audit-documents'
  AND public.is_vivacity_team_safe(auth.uid())
);

-- audit-documents: Staff can delete
CREATE POLICY "audit_docs_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'audit-documents'
  AND public.is_vivacity_team_safe(auth.uid())
);

-- compliance-evidence: Staff or tenant members can view
CREATE POLICY "compliance_evidence_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'compliance-evidence'
  AND (
    public.is_vivacity_team_safe(auth.uid())
    OR public.has_tenant_access_safe((storage.foldername(name))[1]::bigint, auth.uid())
  )
);

-- compliance-evidence: Staff or tenant members can upload
CREATE POLICY "compliance_evidence_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'compliance-evidence'
  AND (
    public.is_vivacity_team_safe(auth.uid())
    OR public.has_tenant_access_safe((storage.foldername(name))[1]::bigint, auth.uid())
  )
);

-- compliance-evidence: Staff or tenant members can update
CREATE POLICY "compliance_evidence_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'compliance-evidence'
  AND (
    public.is_vivacity_team_safe(auth.uid())
    OR public.has_tenant_access_safe((storage.foldername(name))[1]::bigint, auth.uid())
  )
);

-- compliance-evidence: Staff can delete
CREATE POLICY "compliance_evidence_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'compliance-evidence'
  AND public.is_vivacity_team_safe(auth.uid())
);