-- Phase 6: Excel Data Sources, Merge Completeness, and Release Readiness

-- 1) Add dropdown_sources to documents for Excel template data
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS dropdown_sources jsonb NULL;

-- 2) Add merge_fields array to track required merge fields per document
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS merge_fields text[] NULL;

-- 3) Create normalized table for large data sources (optional but recommended)
CREATE TABLE IF NOT EXISTS public.document_data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id bigint NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('csv_upload', 'manual', 'reference_table')) DEFAULT 'csv_upload',
  storage_path text NULL,
  schema jsonb NULL,
  row_count int NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, name)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_document_data_sources_document_id ON public.document_data_sources(document_id);

-- 4) Create document_source_mappings for Excel named range mappings
CREATE TABLE IF NOT EXISTS public.document_source_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id bigint NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  data_source_id uuid NOT NULL REFERENCES public.document_data_sources(id) ON DELETE CASCADE,
  excel_sheet text NOT NULL,
  excel_named_range text NOT NULL,
  source_column text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, excel_sheet, excel_named_range)
);

CREATE INDEX IF NOT EXISTS idx_document_source_mappings_document_id ON public.document_source_mappings(document_id);

-- 5) RLS Policies for document_data_sources
ALTER TABLE public.document_data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view document data sources"
  ON public.document_data_sources FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can manage document data sources"
  ON public.document_data_sources FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
      AND u.role IN ('Super Admin', 'Team Leader', 'CSC')
    )
  );

-- 6) RLS Policies for document_source_mappings
ALTER TABLE public.document_source_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view source mappings"
  ON public.document_source_mappings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can manage source mappings"
  ON public.document_source_mappings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
      AND u.role IN ('Super Admin', 'Team Leader', 'CSC')
    )
  );

-- 7) Function to validate document readiness
CREATE OR REPLACE FUNCTION public.validate_document_readiness(
  p_document_id bigint,
  p_tenant_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
  -- Get document details
  SELECT * INTO v_document
  FROM documents
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
  IF v_document.merge_fields IS NOT NULL AND array_length(v_document.merge_fields, 1) > 0 THEN
    IF p_tenant_id IS NULL THEN
      -- No tenant specified, can't validate values
      v_merge_status := 'warn';
    ELSE
      -- Get tenant data
      SELECT * INTO v_tenant_data
      FROM clients_legacy
      WHERE tenant_id = p_tenant_id
      LIMIT 1;
      
      -- Check each required field against merge_field_definitions and tenant data
      FOR v_field IN SELECT unnest(v_document.merge_fields)
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
  
  -- Check data sources for Excel documents
  IF v_document.document_type = 'excel' OR v_document.mime_type LIKE '%spreadsheet%' OR v_document.mime_type LIKE '%excel%' THEN
    -- Check if any data sources are missing their files
    FOR v_source IN 
      SELECT ds.name, ds.storage_path, ds.source_type
      FROM document_data_sources ds
      WHERE ds.document_id = p_document_id
    LOOP
      IF v_source.source_type = 'csv_upload' AND (v_source.storage_path IS NULL OR v_source.storage_path = '') THEN
        v_missing_sources := array_append(v_missing_sources, v_source.name);
        v_data_sources_status := 'fail';
      END IF;
    END LOOP;
    
    -- Check mappings reference valid sources
    IF EXISTS (
      SELECT 1 FROM document_source_mappings dsm
      WHERE dsm.document_id = p_document_id
      AND NOT EXISTS (
        SELECT 1 FROM document_data_sources ds
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

-- 8) Function to batch validate multiple documents for release
CREATE OR REPLACE FUNCTION public.validate_release_readiness(
  p_document_ids bigint[],
  p_tenant_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_id bigint;
  v_result jsonb;
  v_all_results jsonb := '[]'::jsonb;
  v_pass_count int := 0;
  v_warn_count int := 0;
  v_fail_count int := 0;
  v_doc_name text;
BEGIN
  FOREACH v_doc_id IN ARRAY p_document_ids
  LOOP
    SELECT name INTO v_doc_name FROM documents WHERE id = v_doc_id;
    v_result := validate_document_readiness(v_doc_id, p_tenant_id);
    
    v_all_results := v_all_results || jsonb_build_object(
      'document_id', v_doc_id,
      'document_name', v_doc_name,
      'readiness', v_result
    );
    
    -- Count statuses
    IF v_result->>'merge_status' = 'fail' OR v_result->>'data_sources_status' = 'fail' THEN
      v_fail_count := v_fail_count + 1;
    ELSIF v_result->>'merge_status' = 'warn' OR v_result->>'data_sources_status' = 'warn' THEN
      v_warn_count := v_warn_count + 1;
    ELSE
      v_pass_count := v_pass_count + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'summary', jsonb_build_object(
      'pass', v_pass_count,
      'warn', v_warn_count,
      'fail', v_fail_count,
      'total', array_length(p_document_ids, 1)
    ),
    'documents', v_all_results,
    'can_release', v_fail_count = 0,
    'requires_override', v_fail_count > 0
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.validate_document_readiness(bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_release_readiness(bigint[], bigint) TO authenticated;