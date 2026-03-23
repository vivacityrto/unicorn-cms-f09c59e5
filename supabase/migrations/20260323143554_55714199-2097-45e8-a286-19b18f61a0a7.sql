CREATE OR REPLACE FUNCTION public.preview_document_delete(p_doc_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_title text;
  v_instances integer;
  v_stage_docs integer;
  v_data_sources integer;
  v_source_mappings integer;
  v_versions integer;
BEGIN
  SELECT title INTO v_doc_title FROM documents WHERE id = p_doc_id;
  IF v_doc_title IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT count(*)::integer INTO v_instances
  FROM document_instances di
  WHERE di.document_id = p_doc_id
    AND EXISTS (
      SELECT 1 FROM stage_instances si
      JOIN package_instances pi ON pi.id = si.packageinstance_id
      WHERE si.id = di.stageinstance_id AND pi.is_active = true
    );

  SELECT count(*)::integer INTO v_stage_docs FROM stage_documents WHERE document_id = p_doc_id;
  SELECT count(*)::integer INTO v_data_sources FROM document_data_sources WHERE document_id = p_doc_id;
  SELECT count(*)::integer INTO v_source_mappings FROM document_source_mappings WHERE document_id = p_doc_id;
  SELECT count(*)::integer INTO v_versions FROM document_versions WHERE document_id = p_doc_id;

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
$$;