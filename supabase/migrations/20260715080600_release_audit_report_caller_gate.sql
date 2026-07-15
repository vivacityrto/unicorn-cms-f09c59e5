-- L3 (15 Jul 2026 Unicorn security audit addendum): release_audit_report was
-- SECURITY DEFINER, EXECUTE for authenticated, with zero caller-identity check.
-- It trusted client-supplied p_released_by and could flip any audit's
-- report_client_visible + insert a portal_documents row. Any authenticated user
-- could release any audit report early and forge the releaser.
--
-- Gate mirrors the UI permission that unlocks ReportTab release
-- (usePermission('audits.report') → Super Admin / Team Leader only), via
-- check_permission(..., 'audits.report', 'full'). Broader than is_vivacity_team_safe
-- would incorrectly admit CSC/CET/BGT who have other audit keys but not report.
--
-- p_released_by is retained for signature compatibility with the deployed
-- release-audit-report edge function (not in this repo). When supplied it must
-- equal auth.uid(); report_released_by / portal uploaded_by / shared_by are
-- always written from auth.uid(), never from the parameter. Edge callers must
-- forward the caller JWT (create-tenant pattern) so auth.uid() resolves under
-- any service-role client.

BEGIN;

CREATE OR REPLACE FUNCTION public.release_audit_report(
  p_audit_id uuid,
  p_released_by uuid,
  p_release_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_caller           uuid;
  v_tenant_id        bigint;
  v_report_path      text;
  v_file_name        text;
  v_portal_doc_id    uuid;
  v_audit_title      text;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required to release audit reports'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.check_permission(v_caller, 'audits.report', 'full') THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to release audit reports'
      USING ERRCODE = '42501';
  END IF;

  -- p_released_by kept for signature compatibility with the deployed edge
  -- function, but must match the JWT caller when supplied. Identity written
  -- below always comes from v_caller (auth.uid()), never from the parameter.
  IF p_released_by IS NOT NULL AND p_released_by IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Access denied: p_released_by must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT subject_tenant_id, report_pdf_path,
         COALESCE(title, 'Audit Report'), doc_number
  INTO v_tenant_id, v_report_path, v_audit_title, v_file_name
  FROM public.client_audits
  WHERE id = p_audit_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Audit not found');
  END IF;

  IF v_report_path IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No report PDF has been generated yet');
  END IF;

  INSERT INTO public.portal_documents (
    tenant_id,
    storage_path,
    file_name,
    file_type,
    direction,
    is_client_visible,
    status,
    source,
    linked_audit_id,
    description,
    uploaded_by,
    uploaded_at,
    shared_at,
    shared_by
  ) VALUES (
    v_tenant_id,
    v_report_path,
    COALESCE(v_file_name, 'Compliance Health Check Report') || '.pdf',
    'application/pdf',
    'outbound',
    true,
    'active',
    'audit_report',
    p_audit_id,
    COALESCE(p_release_notes, 'Compliance audit report'),
    v_caller,
    now(),
    now(),
    v_caller
  )
  RETURNING id INTO v_portal_doc_id;

  UPDATE public.client_audits SET
    report_client_visible  = true,
    report_released_at     = now(),
    report_released_by     = v_caller,
    report_release_notes   = p_release_notes
  WHERE id = p_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'portal_document_id', v_portal_doc_id,
    'released_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.release_audit_report(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_audit_report(uuid, uuid, text) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
