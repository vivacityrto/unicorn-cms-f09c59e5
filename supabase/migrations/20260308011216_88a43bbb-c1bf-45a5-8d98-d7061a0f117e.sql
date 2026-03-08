-- Fix validate_document_readiness: replace dropped merge_fields column
-- with document_fields + dd_fields as the authoritative source for required fields.
-- Validates against v_tenant_merge_fields for actual values.

CREATE OR REPLACE FUNCTION public.validate_document_readiness(
  p_document_id bigint,
  p_tenant_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document record;
  v_missing_fields text[] := '{}';
  v_missing_sources text[] := '{}';
  v_merge_status text := 'pass';
  v_data_sources_status text := 'pass';
  v_source record;
  v_field record;
  v_tenant_value text;
  v_required_tags text[];
BEGIN
  -- Get document details
  SELECT * INTO v_document
  FROM public.documents
  WHERE id = p_document_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'merge_status', 'fail',
      'missing_fields', ARRAY['Document not found'],
      'data_sources_status', 'fail',
      'missing_tables', ARRAY[]::text[]
    );
  END IF;
  
  -- Get required merge field tags from document_fields + dd_fields
  SELECT array_agg(df.tag) INTO v_required_tags
  FROM public.document_fields docf
  JOIN public.dd_fields df ON df.id = docf.field_id
  WHERE docf.document_id = p_document_id
    AND df.is_active = true;

  -- If document has required fields, validate them
  IF v_required_tags IS NOT NULL AND array_length(v_required_tags, 1) > 0 THEN
    IF p_tenant_id IS NULL THEN
      -- No tenant context, can't validate values
      v_merge_status := 'warn';
    ELSE
      -- Check each required field against v_tenant_merge_fields
      FOR v_field IN
        SELECT unnest(v_required_tags) AS tag
      LOOP
        SELECT vmf.value INTO v_tenant_value
        FROM public.v_tenant_merge_fields vmf
        WHERE vmf.tenant_id = p_tenant_id
          AND vmf.field_tag = v_field.tag
        LIMIT 1;

        IF v_tenant_value IS NULL OR TRIM(v_tenant_value) = '' THEN
          v_missing_fields := array_append(v_missing_fields, v_field.tag);
          v_merge_status := 'fail';
        END IF;
      END LOOP;
    END IF;
  END IF;
  
  -- Check data sources for Excel documents
  IF LOWER(COALESCE(v_document.format, '')) = 'excel' 
     OR LOWER(COALESCE(v_document.format, '')) LIKE '%spreadsheet%' THEN
    FOR v_source IN 
      SELECT ds.name, ds.storage_path, ds.source_type
      FROM public.document_data_sources ds
      WHERE ds.document_id = p_document_id
    LOOP
      IF v_source.source_type = 'csv_upload' AND (v_source.storage_path IS NULL OR v_source.storage_path = '') THEN
        v_missing_sources := array_append(v_missing_sources, v_source.name);
        v_data_sources_status := 'fail';
      END IF;
    END LOOP;
    
    IF EXISTS (
      SELECT 1 FROM public.document_source_mappings dsm
      WHERE dsm.document_id = p_document_id
      AND NOT EXISTS (
        SELECT 1 FROM public.document_data_sources ds
        WHERE ds.id = dsm.data_source_id
        AND ds.storage_path IS NOT NULL
      )
    ) THEN
      v_data_sources_status := 'fail';
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'merge_status', v_merge_status,
    'missing_fields', v_missing_fields,
    'data_sources_status', v_data_sources_status,
    'missing_tables', v_missing_sources
  );
END;
$$;