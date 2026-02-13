
-- ============================================
-- Document Intelligence Storage - Phase 1
-- ============================================

-- doc_files: metadata for ingested documents
CREATE TABLE public.doc_files (
  doc_file_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  package_id bigint NULL,
  phase_id bigint NULL,
  uploader_user_id uuid NOT NULL,
  source text NOT NULL,
  source_url text NULL,
  storage_path text NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  doc_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- doc_chunks: chunked text from documents
CREATE TABLE public.doc_chunks (
  doc_chunk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  doc_file_id uuid NOT NULL REFERENCES public.doc_files(doc_file_id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  chunk_text text NOT NULL,
  page_ref text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(doc_file_id, chunk_index)
);

-- ============================================
-- Validation triggers
-- ============================================

CREATE OR REPLACE FUNCTION public.validate_doc_file_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source NOT IN ('supabase_storage', 'sharepoint') THEN
    RAISE EXCEPTION 'Invalid doc_files.source: %. Must be supabase_storage or sharepoint.', NEW.source;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_doc_file_source
  BEFORE INSERT OR UPDATE ON public.doc_files
  FOR EACH ROW EXECUTE FUNCTION public.validate_doc_file_source();

CREATE OR REPLACE FUNCTION public.validate_doc_file_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.doc_type NOT IN ('tas', 'trainer_matrix', 'policy', 'other') THEN
    RAISE EXCEPTION 'Invalid doc_files.doc_type: %. Must be tas, trainer_matrix, policy, or other.', NEW.doc_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_doc_file_type
  BEFORE INSERT OR UPDATE ON public.doc_files
  FOR EACH ROW EXECUTE FUNCTION public.validate_doc_file_type();

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX idx_doc_files_tenant ON public.doc_files(tenant_id);
CREATE INDEX idx_doc_files_package ON public.doc_files(package_id) WHERE package_id IS NOT NULL;
CREATE INDEX idx_doc_chunks_doc_file ON public.doc_chunks(doc_file_id);
CREATE INDEX idx_doc_chunks_tenant ON public.doc_chunks(tenant_id);

-- ============================================
-- RLS
-- ============================================

ALTER TABLE public.doc_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_chunks ENABLE ROW LEVEL SECURITY;

-- doc_files: Vivacity staff full access within tenant scope
CREATE POLICY "vivacity_staff_select_doc_files"
  ON public.doc_files FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "vivacity_staff_insert_doc_files"
  ON public.doc_files FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- doc_files: Tenant admins can select/insert for own tenant
CREATE POLICY "tenant_admin_select_doc_files"
  ON public.doc_files FOR SELECT
  TO authenticated
  USING (
    NOT public.is_vivacity_team_safe(auth.uid())
    AND public.has_tenant_access_safe(tenant_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = doc_files.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
        AND tm.status = 'active'
    )
  );

CREATE POLICY "tenant_admin_insert_doc_files"
  ON public.doc_files FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT public.is_vivacity_team_safe(auth.uid())
    AND public.has_tenant_access_safe(tenant_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = doc_files.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
        AND tm.status = 'active'
    )
  );

-- doc_files: Client general users can select if they have package access
CREATE POLICY "client_select_doc_files"
  ON public.doc_files FOR SELECT
  TO authenticated
  USING (
    NOT public.is_vivacity_team_safe(auth.uid())
    AND public.has_tenant_access_safe(tenant_id, auth.uid())
    AND package_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.package_instances pi
      WHERE pi.tenant_id = doc_files.tenant_id
        AND pi.package_id = doc_files.package_id
        AND pi.is_complete = false
    )
  );

-- doc_chunks: Vivacity staff only in Phase 1
CREATE POLICY "vivacity_staff_select_doc_chunks"
  ON public.doc_chunks FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "vivacity_staff_insert_doc_chunks"
  ON public.doc_chunks FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- Tenant admins can insert chunks for their tenant
CREATE POLICY "tenant_admin_insert_doc_chunks"
  ON public.doc_chunks FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT public.is_vivacity_team_safe(auth.uid())
    AND public.has_tenant_access_safe(tenant_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = doc_chunks.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
        AND tm.status = 'active'
    )
  );
