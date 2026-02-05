-- =====================================================
-- AI Assistant Feature - Database Tables and RLS
-- SuperAdmin only access for internal knowledge assistant
-- =====================================================

-- =====================================================
-- 1. ASSISTANT THREADS TABLE
-- Stores chat threads for the assistant
-- =====================================================
CREATE TABLE public.assistant_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assistant_threads ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SuperAdmin only, own threads
CREATE POLICY "assistant_threads_superadmin_own"
  ON public.assistant_threads
  FOR ALL
  TO authenticated
  USING (
    viewer_user_id = auth.uid()
    AND public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    viewer_user_id = auth.uid()
    AND public.is_super_admin(auth.uid())
  );

-- Trigger for updated_at
CREATE TRIGGER update_assistant_threads_updated_at
  BEFORE UPDATE ON public.assistant_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 2. ASSISTANT MESSAGES TABLE
-- Stores messages within threads
-- =====================================================
CREATE TABLE public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.assistant_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  sources_used jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Access via thread ownership (SuperAdmin only)
CREATE POLICY "assistant_messages_via_thread"
  ON public.assistant_messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assistant_threads t
      WHERE t.id = thread_id
      AND t.viewer_user_id = auth.uid()
      AND public.is_super_admin(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assistant_threads t
      WHERE t.id = thread_id
      AND t.viewer_user_id = auth.uid()
      AND public.is_super_admin(auth.uid())
    )
  );

-- Index for thread lookups
CREATE INDEX idx_assistant_messages_thread_id ON public.assistant_messages(thread_id);

-- =====================================================
-- 3. ASSISTANT AUDIT LOG TABLE
-- Logs every interaction for compliance/audit
-- =====================================================
CREATE TABLE public.assistant_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.assistant_threads(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('chat_query', 'report_generate', 'source_lookup', 'refusal')),
  client_tenant_id bigint REFERENCES public.tenants(id) ON DELETE SET NULL,
  report_type text,
  sources_used jsonb NOT NULL DEFAULT '[]',
  redactions_applied jsonb NOT NULL DEFAULT '[]',
  request_text text NOT NULL,
  response_summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assistant_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SuperAdmin only, own logs
CREATE POLICY "assistant_audit_log_superadmin_own"
  ON public.assistant_audit_log
  FOR ALL
  TO authenticated
  USING (
    viewer_user_id = auth.uid()
    AND public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    viewer_user_id = auth.uid()
    AND public.is_super_admin(auth.uid())
  );

-- Indexes for audit queries
CREATE INDEX idx_assistant_audit_log_viewer ON public.assistant_audit_log(viewer_user_id);
CREATE INDEX idx_assistant_audit_log_created ON public.assistant_audit_log(created_at DESC);
CREATE INDEX idx_assistant_audit_log_action ON public.assistant_audit_log(action);

-- =====================================================
-- 4. KNOWLEDGE ITEMS TABLE
-- Approved internal knowledge sources
-- =====================================================
CREATE TABLE public.knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN (
    'platform_doc', 
    'policy', 
    'regulatory_mapping', 
    'package_phase', 
    'eos_process', 
    'template', 
    'config_meta'
  )),
  title text NOT NULL,
  content text NOT NULL,
  version text NOT NULL DEFAULT '1.0',
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approval_status text NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft', 'approved', 'archived')),
  review_date date,
  applicable_packages jsonb DEFAULT '[]',
  applicable_phases jsonb DEFAULT '[]',
  applicable_roles jsonb DEFAULT '[]',
  tags text[] DEFAULT '{}',
  -- Explicitly exclude Standards for RTOs 2015
  excludes_rto_2015 boolean NOT NULL DEFAULT false,
  -- For regulatory mappings - which standard
  regulatory_standard text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SuperAdmin can read approved items only
CREATE POLICY "knowledge_items_superadmin_read_approved"
  ON public.knowledge_items
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    AND approval_status = 'approved'
  );

-- RLS Policy: SuperAdmin can manage all knowledge items
CREATE POLICY "knowledge_items_superadmin_manage"
  ON public.knowledge_items
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_knowledge_items_updated_at
  BEFORE UPDATE ON public.knowledge_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for knowledge retrieval
CREATE INDEX idx_knowledge_items_source_type ON public.knowledge_items(source_type);
CREATE INDEX idx_knowledge_items_approval_status ON public.knowledge_items(approval_status);
CREATE INDEX idx_knowledge_items_tags ON public.knowledge_items USING gin(tags);
CREATE INDEX idx_knowledge_items_regulatory ON public.knowledge_items(regulatory_standard) WHERE regulatory_standard IS NOT NULL;

-- Full-text search index for content
CREATE INDEX idx_knowledge_items_content_fts ON public.knowledge_items 
  USING gin(to_tsvector('english', title || ' ' || content));

-- =====================================================
-- 5. HELPER FUNCTION FOR KNOWLEDGE RETRIEVAL
-- Enforces approved-only and excludes 2015 standards
-- =====================================================
CREATE OR REPLACE FUNCTION public.search_knowledge_items(
  p_search_query text,
  p_source_types text[] DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  source_type text,
  title text,
  content text,
  version text,
  tags text[],
  rank real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only SuperAdmins can search
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: SuperAdmin only';
  END IF;

  RETURN QUERY
  SELECT 
    ki.id,
    ki.source_type,
    ki.title,
    ki.content,
    ki.version,
    ki.tags,
    ts_rank(to_tsvector('english', ki.title || ' ' || ki.content), plainto_tsquery('english', p_search_query)) as rank
  FROM public.knowledge_items ki
  WHERE 
    ki.approval_status = 'approved'
    AND (p_source_types IS NULL OR ki.source_type = ANY(p_source_types))
    -- Exclude RTO 2015 regulatory mappings
    AND NOT (ki.source_type = 'regulatory_mapping' AND ki.regulatory_standard = 'Standards for RTOs 2015')
    AND to_tsvector('english', ki.title || ' ' || ki.content) @@ plainto_tsquery('english', p_search_query)
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$;

-- =====================================================
-- 6. GRANT PERMISSIONS
-- =====================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.assistant_threads TO authenticated;
GRANT ALL ON public.assistant_messages TO authenticated;
GRANT ALL ON public.assistant_audit_log TO authenticated;
GRANT ALL ON public.knowledge_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_knowledge_items TO authenticated;