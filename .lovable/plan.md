Fix the document-stage usage safety-net so shared documents report all linked stages, not just their primary stage.

Changes

1. View public.document_stage_usage
   - Replace the single-stage join with a union subquery that collects stage associations from both documents.stage and public.document_stage_links.
   - Keep the same output columns (document_id, title, stage_count, stage_names).
   - Preserve security_invoker = true.
   - Result: documents with secondary links show stage_count > 1 and all relevant stage names.

2. Function public.get_document_stage_usage(p_document_id bigint)
   - Keep STABLE SECURITY DEFINER and SET search_path TO 'public' exactly as today.
   - Add a second RETURN QUERY branch that selects stages from public.document_stage_links and unions it with the existing documents.stage branch.
   - Leave pinned_version_id and pinned_version_number NULL in both branches.
   - No grant changes — authenticated and service_role already have EXECUTE, confirmed live; don't add anon, and don't touch existing grants at all.

Verification
   - SELECT * FROM document_stage_usage WHERE document_id = 7346; should return stage_count = 2 and both stage names.
   - SELECT * FROM get_document_stage_usage(7346); should return two rows.
   - Spot-check a single-stage document to confirm unchanged behavior.

Out of scope
   - No changes to DocumentLibraryBrowser.tsx, StageDocumentsPanel.tsx, useDocumentAIAnalysis.tsx, useDocumentVersions.tsx, or DocumentStageUsagePanel.tsx — they consume these objects and will automatically see corrected data.
   - No changes to version pinning logic.
   - No changes to documents.stage primary-stage behavior.
   - No grant/permission changes of any kind.