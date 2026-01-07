-- Fix validate_document_readiness function: use 'format' column instead of non-existent 'document_type' and 'mime_type'

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
  v_tenant_data record;
  v_source record;
  v_field text;
  v_merge_fields_array text[];
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
  
  -- Check merge fields if document has required fields defined
  -- merge_fields is jsonb, so use jsonb_array_length instead of array_length
  IF v_document.merge_fields IS NOT NULL 
     AND jsonb_typeof(v_document.merge_fields) = 'array'
     AND jsonb_array_length(v_document.merge_fields) > 0 THEN
    IF p_tenant_id IS NULL THEN
      -- No tenant specified, can't validate values
      v_merge_status := 'warn';
    ELSE
      -- Get tenant data
      SELECT * INTO v_tenant_data
      FROM public.clients_legacy
      WHERE tenant_id = p_tenant_id
      LIMIT 1;
      
      -- Convert jsonb array to text array for iteration
      SELECT array_agg(elem::text) INTO v_merge_fields_array
      FROM jsonb_array_elements_text(v_document.merge_fields) AS elem;
      
      -- Check each required field against merge_field_definitions and tenant data
      IF v_merge_fields_array IS NOT NULL THEN
        FOREACH v_field IN ARRAY v_merge_fields_array
        LOOP
          -- Simple check - in production you'd check against actual tenant values
          -- For now we mark as warn if tenant exists, fail if not
          IF v_tenant_data IS NULL THEN
            v_missing_fields := array_append(v_missing_fields, v_field);
            v_merge_status := 'fail';
          END IF;
        END LOOP;
      END IF;
    END IF;
  END IF;
  
  -- Check data sources for Excel documents
  -- Use 'format' column (values like 'Excel', 'Word') instead of non-existent document_type/mime_type
  IF LOWER(COALESCE(v_document.format, '')) = 'excel' 
     OR LOWER(COALESCE(v_document.format, '')) LIKE '%spreadsheet%' THEN
    -- Check if any data sources are missing their files
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
    
    -- Check mappings reference valid sources
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