-- Task #20 (14 Jul 2026 Unicorn security audit follow-up): preview_document_delete
-- had no permission check, unlike its already-gated companion delete_document_cascade
-- (finding C3). Any authenticated user (staff or tenant/portal) could learn a document's
-- title and system-wide usage counts for any doc id. Confirmed sole caller
-- (ManageDocuments.tsx) is behind ProtectedRoute only, not staff-restricted UI, and the
-- call sits in an empty catch{} so a 42501 denial degrades gracefully (impact counts
-- just stay unset). Same gate as C3: is_vivacity_team_safe(auth.uid()).
-- Also fixes search_path (was 'public', now '' per convention) and schema-qualifies
-- all table references. Return shape and counting logic unchanged.
-- Applied directly to production 15 Jul 2026 and persona-verified; this migration is a
-- no-op against current live behavior (CREATE OR REPLACE of identical body).
CREATE OR REPLACE FUNCTION public.preview_document_delete(p_doc_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_doc_title text;
  v_instances integer;
  v_stage_docs integer;
  v_data_sources integer;
  v_source_mappings integer;
  v_versions integer;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to preview document deletion'
      USING ERRCODE = '42501';
  END IF;

  SELECT title INTO v_doc_title FROM public.documents WHERE id = p_doc_id;
  IF v_doc_title IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT count(*)::integer INTO v_instances
  FROM public.document_instances di
  WHERE di.document_id = p_doc_id
    AND EXISTS (
      SELECT 1 FROM public.stage_instances si
      JOIN public.package_instances pi ON pi.id = si.packageinstance_id
      WHERE si.id = di.stageinstance_id AND pi.is_active = true
    );

  SELECT count(*)::integer INTO v_stage_docs FROM public.stage_documents WHERE document_id = p_doc_id;
  SELECT count(*)::integer INTO v_data_sources FROM public.document_data_sources WHERE document_id = p_doc_id;
  SELECT count(*)::integer INTO v_source_mappings FROM public.document_source_mappings WHERE document_id = p_doc_id;
  SELECT count(*)::integer INTO v_versions FROM public.document_versions WHERE document_id = p_doc_id;

  RETURN jsonb_build_object(
    'found', true,
    'title', v_doc_title,
    'instances', v_instances,
    'stage_docs', v_stage_docs,
    'data_sources', v_data_sources,
    'source_mappings', v_source_mappings,
    'versions', v_versions
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
