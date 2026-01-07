-- Phase 5: Document Lifecycle (fixed migration)

-- Drop the incorrectly structured document_versions table
DROP TABLE IF EXISTS public.document_versions CASCADE;

-- 1) Create proper Document Versions table
CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id bigint NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NULL,
  file_size bigint NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (document_id, version_number)
);

CREATE INDEX idx_document_versions_document_id ON public.document_versions(document_id);
CREATE INDEX idx_document_versions_status ON public.document_versions(status);

-- 2) Add columns to documents table
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS current_published_version_id uuid NULL,
ADD COLUMN IF NOT EXISTS document_status text NOT NULL DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS document_category text NULL,
ADD COLUMN IF NOT EXISTS standard_set text NULL,
ADD COLUMN IF NOT EXISTS standard_refs text[] NULL;

-- Add foreign key after document_versions exists
ALTER TABLE public.documents 
ADD CONSTRAINT fk_documents_current_version 
FOREIGN KEY (current_published_version_id) REFERENCES public.document_versions(id);

-- Add check constraint separately
ALTER TABLE public.documents 
ADD CONSTRAINT chk_document_status CHECK (document_status IN ('draft', 'published', 'archived'));

-- 3) Add pinned_version_id to stage_documents
ALTER TABLE public.stage_documents
ADD COLUMN IF NOT EXISTS pinned_version_id uuid NULL REFERENCES public.document_versions(id);

-- 4) Tenant document releases table
CREATE TABLE public.tenant_document_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_id bigint NULL REFERENCES public.packages(id) ON DELETE SET NULL,
  stage_id bigint NULL REFERENCES public.documents_stages(id) ON DELETE SET NULL,
  document_id bigint NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  document_version_id uuid NOT NULL REFERENCES public.document_versions(id) ON DELETE CASCADE,
  released_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid REFERENCES auth.users(id),
  is_visible_to_tenant boolean NOT NULL DEFAULT true,
  downloaded_at timestamptz NULL,
  acknowledged_at timestamptz NULL
);

CREATE INDEX idx_tenant_doc_releases_tenant ON public.tenant_document_releases(tenant_id);
CREATE INDEX idx_tenant_doc_releases_document ON public.tenant_document_releases(document_id);
CREATE INDEX idx_tenant_doc_releases_package ON public.tenant_document_releases(package_id);

-- 5) Enable RLS
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_document_releases ENABLE ROW LEVEL SECURITY;

-- 6) RLS Policies for document_versions
CREATE POLICY "Authenticated users can view document versions"
ON public.document_versions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert document versions"
ON public.document_versions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update document versions"
ON public.document_versions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete document versions"
ON public.document_versions FOR DELETE TO authenticated USING (true);

-- 7) RLS Policies for tenant_document_releases
CREATE POLICY "Authenticated users can view tenant document releases"
ON public.tenant_document_releases FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert tenant document releases"
ON public.tenant_document_releases FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update tenant document releases"
ON public.tenant_document_releases FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete tenant document releases"
ON public.tenant_document_releases FOR DELETE TO authenticated USING (true);

-- 8) Function to publish a document version
CREATE OR REPLACE FUNCTION public.publish_document_version(
  p_document_id bigint,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_next_version int;
  v_new_version_id uuid;
  v_current_path text;
  v_current_file text;
BEGIN
  SELECT uploaded_files[1], title
  INTO v_current_path, v_current_file
  FROM public.documents WHERE id = p_document_id;
  
  IF v_current_path IS NULL THEN
    RAISE EXCEPTION 'Document not found or has no files';
  END IF;
  
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM public.document_versions WHERE document_id = p_document_id;
  
  INSERT INTO public.document_versions (
    document_id, version_number, status, storage_path, file_name, notes, created_by
  ) VALUES (
    p_document_id, v_next_version, 'published', v_current_path, v_current_file, p_notes, auth.uid()
  ) RETURNING id INTO v_new_version_id;
  
  UPDATE public.document_versions SET status = 'archived'
  WHERE document_id = p_document_id AND id != v_new_version_id AND status = 'published';
  
  UPDATE public.documents
  SET current_published_version_id = v_new_version_id, document_status = 'published'
  WHERE id = p_document_id;
  
  RETURN v_new_version_id;
END;
$$;

-- 9) Function to release documents to tenant
CREATE OR REPLACE FUNCTION public.release_documents_to_tenant(
  p_tenant_id bigint,
  p_package_id bigint,
  p_stage_id bigint,
  p_document_ids bigint[]
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_doc_id bigint;
  v_version_id uuid;
  v_count int := 0;
BEGIN
  FOREACH v_doc_id IN ARRAY p_document_ids LOOP
    SELECT current_published_version_id INTO v_version_id
    FROM public.documents WHERE id = v_doc_id;
    
    IF v_version_id IS NOT NULL THEN
      INSERT INTO public.tenant_document_releases (
        tenant_id, package_id, stage_id, document_id, document_version_id, released_by, is_visible_to_tenant
      ) VALUES (
        p_tenant_id, p_package_id, p_stage_id, v_doc_id, v_version_id, auth.uid(), true
      ) ON CONFLICT DO NOTHING;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 10) Function for bulk document creation with versions
CREATE OR REPLACE FUNCTION public.bulk_create_documents_with_versions(
  p_documents jsonb,
  p_category text DEFAULT NULL,
  p_standard_set text DEFAULT NULL,
  p_standard_refs text[] DEFAULT NULL,
  p_auto_publish boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_doc jsonb;
  v_doc_id bigint;
  v_version_id uuid;
  v_results jsonb := '[]'::jsonb;
BEGIN
  FOR v_doc IN SELECT * FROM jsonb_array_elements(p_documents) LOOP
    INSERT INTO public.documents (
      title, description, uploaded_files, document_category, standard_set, standard_refs, document_status
    ) VALUES (
      v_doc->>'title',
      v_doc->>'description',
      ARRAY[v_doc->>'storage_path'],
      COALESCE(v_doc->>'category', p_category),
      COALESCE(v_doc->>'standard_set', p_standard_set),
      COALESCE((SELECT array_agg(x::text) FROM jsonb_array_elements_text(v_doc->'standard_refs') x), p_standard_refs),
      CASE WHEN p_auto_publish THEN 'published' ELSE 'draft' END
    ) RETURNING id INTO v_doc_id;
    
    INSERT INTO public.document_versions (
      document_id, version_number, status, storage_path, file_name, mime_type, file_size, created_by
    ) VALUES (
      v_doc_id, 1,
      CASE WHEN p_auto_publish THEN 'published' ELSE 'draft' END,
      v_doc->>'storage_path', v_doc->>'file_name', v_doc->>'mime_type',
      (v_doc->>'file_size')::bigint, auth.uid()
    ) RETURNING id INTO v_version_id;
    
    IF p_auto_publish THEN
      UPDATE public.documents SET current_published_version_id = v_version_id WHERE id = v_doc_id;
    END IF;
    
    v_results := v_results || jsonb_build_object('document_id', v_doc_id, 'version_id', v_version_id, 'title', v_doc->>'title');
  END LOOP;
  RETURN v_results;
END;
$$;

-- 11) Function to get document usage across stages
CREATE OR REPLACE FUNCTION public.get_document_stage_usage(p_document_id bigint)
RETURNS TABLE (stage_id bigint, stage_name text, package_count bigint, pinned_version_id uuid, pinned_version_number int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sd.stage_id,
    ds.name,
    (SELECT COUNT(DISTINCT ps.package_id) FROM public.package_stages ps WHERE ps.stage_id = sd.stage_id),
    sd.pinned_version_id,
    dv.version_number
  FROM public.stage_documents sd
  JOIN public.documents_stages ds ON ds.id = sd.stage_id
  LEFT JOIN public.document_versions dv ON dv.id = sd.pinned_version_id
  WHERE sd.document_id = p_document_id;
END;
$$;

-- 12) Track document download
CREATE OR REPLACE FUNCTION public.track_document_download(p_release_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.tenant_document_releases SET downloaded_at = now()
  WHERE id = p_release_id AND downloaded_at IS NULL;
END;
$$;

-- 13) Acknowledge document
CREATE OR REPLACE FUNCTION public.acknowledge_document(p_release_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.tenant_document_releases SET acknowledged_at = now()
  WHERE id = p_release_id AND acknowledged_at IS NULL;
END;
$$;