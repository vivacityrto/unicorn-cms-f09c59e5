-- Reconciles git with the live production definition of
-- delete_document_cascade, which drifted from what's committed here.
-- Per list_migrations, the live version was applied 2026-07-15 as
-- "harden_delete_document_cascade_c3", but no matching file exists
-- anywhere in this repo's git history -- undocumented prod-only drift,
-- surfaced during the 2026-08-12 Manage Documents duplicate cleanup
-- (see docs/audit-log/entries/2026-08-12-manage-documents-duplicate-cleanup.md).
--
-- Two behavioral differences vs. the git-committed version
-- (20260323133918_72874c5e-ef31-4378-8035-610da412f7c1.sql):
--   1. Adds an is_vivacity_team_safe(auth.uid()) permission check --
--      previously anyone with EXECUTE could call this SECURITY DEFINER
--      function and delete any document template.
--   2. Fixes a bug where it tried to DELETE FROM documents_tenants WHERE
--      document_id = ... -- that table has no document_id column at all
--      (it's a denormalized per-tenant snapshot, not FK'd to documents),
--      so every call to this function would have errored before ever
--      reaching the final DELETE FROM documents. tenant_docs_deleted is
--      now hardcoded to 0 instead.
--
-- This migration is a no-op against the live database (CREATE OR REPLACE
-- with identical body, verified byte-for-byte against pg_get_functiondef)
-- -- it exists purely to make git match prod.
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
  v_doc_title text;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to delete document templates'
      USING ERRCODE = '42501';
  END IF;

  SELECT title INTO v_doc_title FROM public.documents WHERE id = p_doc_id;

  IF v_doc_title IS NULL THEN
    RAISE EXCEPTION 'Document with id % not found', p_doc_id;
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
    'tenant_docs_deleted', v_tenant_docs_deleted,
    'data_sources_deleted', v_data_sources_deleted,
    'source_mappings_deleted', v_source_mappings_deleted
  );
END;
$function$;
