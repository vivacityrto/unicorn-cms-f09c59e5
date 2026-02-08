-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Vector Embeddings for Ask Viv
-- Stores vectorized content chunks with tenant isolation

-- Create vector_embeddings table
CREATE TABLE public.vector_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tenant isolation (namespace key: tenant:{tenant_id}:{source_type}:{record_id})
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  namespace_key text NOT NULL,
  
  -- Source tracking
  source_type text NOT NULL CHECK (source_type IN (
    'internal_docs', 'client_summary', 'phase_summary', 
    'task', 'consult_log', 'document_metadata', 'process_mapping'
  )),
  record_id text NOT NULL,
  record_label text NOT NULL,
  
  -- Content
  chunk_index integer NOT NULL DEFAULT 0,
  chunk_text text NOT NULL,
  token_count integer NOT NULL DEFAULT 0,
  
  -- Embedding vector (1536 dimensions for text-embedding-3-small)
  embedding extensions.vector(1536),
  
  -- Mode control
  mode_allowed text NOT NULL CHECK (mode_allowed IN ('knowledge', 'compliance', 'both')),
  
  -- Metadata
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Unique constraint per chunk
  CONSTRAINT unique_chunk_per_record UNIQUE (tenant_id, source_type, record_id, chunk_index)
);

-- Create indexes for efficient retrieval
CREATE INDEX idx_vector_embeddings_tenant ON public.vector_embeddings(tenant_id);
CREATE INDEX idx_vector_embeddings_namespace ON public.vector_embeddings(namespace_key);
CREATE INDEX idx_vector_embeddings_source ON public.vector_embeddings(source_type);
CREATE INDEX idx_vector_embeddings_mode ON public.vector_embeddings(mode_allowed);
CREATE INDEX idx_vector_embeddings_updated ON public.vector_embeddings(last_updated_at);

-- Enable RLS
ALTER TABLE public.vector_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- SuperAdmins and Vivacity Team can read all embeddings
CREATE POLICY "vector_embeddings_read_staff"
ON public.vector_embeddings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
    AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  )
);

-- Client users can read their tenant's embeddings only
CREATE POLICY "vector_embeddings_read_tenant"
ON public.vector_embeddings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
    AND tm.tenant_id = vector_embeddings.tenant_id
    AND tm.status = 'active'
  )
);

-- Only system/SuperAdmin can insert/update/delete (via service role)
CREATE POLICY "vector_embeddings_write_admin"
ON public.vector_embeddings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
    AND u.unicorn_role = 'Super Admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
    AND u.unicorn_role = 'Super Admin'
  )
);

-- Create vector_index_logs table for audit tracking
CREATE TABLE public.vector_index_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('rebuild', 'update', 'remove', 'bulk_delete')),
  source_type text,
  record_id text,
  records_affected integer NOT NULL DEFAULT 0,
  performed_by uuid NOT NULL REFERENCES public.users(user_uuid),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for log queries
CREATE INDEX idx_vector_index_logs_tenant ON public.vector_index_logs(tenant_id);
CREATE INDEX idx_vector_index_logs_action ON public.vector_index_logs(action);
CREATE INDEX idx_vector_index_logs_created ON public.vector_index_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.vector_index_logs ENABLE ROW LEVEL SECURITY;

-- Only staff can read logs
CREATE POLICY "vector_index_logs_read_staff"
ON public.vector_index_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
    AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  )
);

-- Only SuperAdmin can insert logs
CREATE POLICY "vector_index_logs_write_admin"
ON public.vector_index_logs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
    AND u.unicorn_role = 'Super Admin'
  )
);

-- Add vector search function for similarity queries
CREATE OR REPLACE FUNCTION public.search_vector_embeddings(
  p_tenant_id integer,
  p_query_embedding extensions.vector(1536),
  p_mode text,
  p_source_types text[] DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_similarity_threshold float DEFAULT 0.7
)
RETURNS TABLE (
  id uuid,
  tenant_id integer,
  source_type text,
  record_id text,
  record_label text,
  chunk_index integer,
  chunk_text text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ve.id,
    ve.tenant_id,
    ve.source_type,
    ve.record_id,
    ve.record_label,
    ve.chunk_index,
    ve.chunk_text,
    ve.metadata,
    (1 - (ve.embedding <=> p_query_embedding))::float AS similarity
  FROM public.vector_embeddings ve
  WHERE ve.tenant_id = p_tenant_id
    AND (ve.mode_allowed = p_mode OR ve.mode_allowed = 'both')
    AND (p_source_types IS NULL OR ve.source_type = ANY(p_source_types))
    AND (1 - (ve.embedding <=> p_query_embedding)) >= p_similarity_threshold
  ORDER BY ve.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- Add columns to ai_interaction_logs for vector tracking
ALTER TABLE public.ai_interaction_logs
ADD COLUMN IF NOT EXISTS chunks_used integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS source_types_used text[] DEFAULT '{}';

-- Comment on tables
COMMENT ON TABLE public.vector_embeddings IS 'Stores vectorized content chunks for Ask Viv with strict tenant isolation';
COMMENT ON TABLE public.vector_index_logs IS 'Audit log for vector index operations';
COMMENT ON FUNCTION public.search_vector_embeddings IS 'Performs vector similarity search within a tenant namespace';