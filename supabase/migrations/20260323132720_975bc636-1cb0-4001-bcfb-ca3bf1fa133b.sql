
CREATE OR REPLACE FUNCTION public.delete_document_cascade(p_doc_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instances_deleted integer;
  v_stage_docs_deleted integer;
  v_tenant_docs_deleted integer;
  v_data_sources_deleted integer;
  v_source_mappings_deleted integer;
  v_doc_title text;
BEGIN
  -- Get doc title for the response
  SELECT title INTO v_doc_title FROM documents WHERE id = p_doc_id;
  
  IF v_doc_title IS NULL THEN
    RAISE EXCEPTION 'Document with id % not found', p_doc_id;
  END IF;

  -- Delete document_instances
  DELETE FROM document_instances WHERE document_id = p_doc_id;
  GET DIAGNOSTICS v_instances_deleted = ROW_COUNT;

  -- Delete stage_documents
  DELETE FROM stage_documents WHERE document_id = p_doc_id;
  GET DIAGNOSTICS v_stage_docs_deleted = ROW_COUNT;

  -- Delete documents_tenants
  DELETE FROM documents_tenants WHERE document_id = p_doc_id;
  GET DIAGNOSTICS v_tenant_docs_deleted = ROW_COUNT;

  -- Delete document_data_sources (may cascade but be explicit)
  DELETE FROM document_data_sources WHERE document_id = p_doc_id;
  GET DIAGNOSTICS v_data_sources_deleted = ROW_COUNT;

  -- Delete document_source_mappings
  DELETE FROM document_source_mappings WHERE document_id = p_doc_id;
  GET DIAGNOSTICS v_source_mappings_deleted = ROW_COUNT;

  -- Delete the document itself
  DELETE FROM documents WHERE id = p_doc_id;

  RETURN jsonb_build_object(
    'title', v_doc_title,
    'instances_deleted', v_instances_deleted,
    'stage_docs_deleted', v_stage_docs_deleted,
    'tenant_docs_deleted', v_tenant_docs_deleted,
    'data_sources_deleted', v_data_sources_deleted,
    'source_mappings_deleted', v_source_mappings_deleted
  );
END;
$$;
