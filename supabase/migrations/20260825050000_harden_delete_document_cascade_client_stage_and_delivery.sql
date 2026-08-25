-- Hardens delete_document_cascade so deleting a document that's assigned to
-- a client's stage (client_stage_documents), or referenced by generated
-- file history (generated_documents), no longer throws a raw FK-violation
-- error. Also adds a clean, friendly block when the document has governance
-- delivery history (governance_document_deliveries), since those rows are
-- compliance evidence of what was actually delivered to which tenant and
-- when -- deleting them silently was rejected in favour of surfacing the
-- conflict to the caller instead.
--
-- See docs/audit-log/entries/2026-08-25-delete-document-cascade-client-stage-and-delivery.md
CREATE OR REPLACE FUNCTION public.delete_document_cascade(p_doc_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_instances_deleted integer;
  v_stage_docs_deleted integer;
  v_tenant_docs_deleted integer;
  v_data_sources_deleted integer;
  v_source_mappings_deleted integer;
  v_client_stage_docs_deleted integer;
  v_generated_docs_unlinked integer;
  v_doc_title text;
  v_delivery_count integer;
  v_delivery_tenant_count integer;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to delete document templates'
      USING ERRCODE = '42501';
  END IF;

  SELECT title INTO v_doc_title FROM public.documents WHERE id = p_doc_id;

  IF v_doc_title IS NULL THEN
    RAISE EXCEPTION 'Document with id % not found', p_doc_id;
  END IF;

  -- Block on governance delivery history rather than let a NOT NULL FK
  -- violation surface -- these rows are the compliance record of what was
  -- actually delivered to which tenant and when, so they aren't cleaned up
  -- automatically.
  SELECT count(*), count(DISTINCT tenant_id)
    INTO v_delivery_count, v_delivery_tenant_count
    FROM public.governance_document_deliveries
    WHERE document_id = p_doc_id;

  IF v_delivery_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete "%": it has % governance delivery record(s) across % tenant(s). Remove those delivery records first if this document must be deleted.',
      v_doc_title, v_delivery_count, v_delivery_tenant_count
      USING ERRCODE = '23503';
  END IF;

  -- Delete document_instances ONLY for active package instances
  DELETE FROM public.document_instances di
  WHERE di.document_id = p_doc_id
    AND EXISTS (
      SELECT 1 FROM public.stage_instances si
      JOIN public.package_instances pi ON pi.id = si.packageinstance_id
      WHERE si.id = di.stageinstance_id
        AND pi.is_active = true
    );
  GET DIAGNOSTICS v_instances_deleted = ROW_COUNT;

  -- Delete stage_documents (template-level links)
  DELETE FROM public.stage_documents WHERE document_id = p_doc_id;
  GET DIAGNOSTICS v_stage_docs_deleted = ROW_COUNT;

  -- Delete client_stage_documents (a client's stage -> document assignment).
  -- document_id is NOT NULL with no cascade, so this must be removed
  -- explicitly before the final DELETE FROM documents.
  DELETE FROM public.client_stage_documents WHERE document_id = p_doc_id;
  GET DIAGNOSTICS v_client_stage_docs_deleted = ROW_COUNT;

  -- Unlink generated_documents from this document/its versions rather than
  -- deleting -- these are historical generated-file records for tenants and
  -- should survive the template being retired.
  UPDATE public.generated_documents
    SET source_document_id = NULL
    WHERE source_document_id = p_doc_id;
  UPDATE public.generated_documents
    SET document_version_id = NULL
    WHERE document_version_id IN (
      SELECT id FROM public.document_versions WHERE document_id = p_doc_id
    );
  GET DIAGNOSTICS v_generated_docs_unlinked = ROW_COUNT;

  -- documents_tenants has no document_id FK, skip
  v_tenant_docs_deleted := 0;

  -- Delete document_data_sources
  DELETE FROM public.document_data_sources WHERE document_id = p_doc_id;
  GET DIAGNOSTICS v_data_sources_deleted = ROW_COUNT;

  -- Delete document_source_mappings
  DELETE FROM public.document_source_mappings WHERE document_id = p_doc_id;
  GET DIAGNOSTICS v_source_mappings_deleted = ROW_COUNT;

  -- Delete the document itself
  DELETE FROM public.documents WHERE id = p_doc_id;

  RETURN jsonb_build_object(
    'title', v_doc_title,
    'instances_deleted', v_instances_deleted,
    'stage_docs_deleted', v_stage_docs_deleted,
    'client_stage_docs_deleted', v_client_stage_docs_deleted,
    'generated_docs_unlinked', v_generated_docs_unlinked,
    'tenant_docs_deleted', v_tenant_docs_deleted,
    'data_sources_deleted', v_data_sources_deleted,
    'source_mappings_deleted', v_source_mappings_deleted
  );
END;
$function$;
