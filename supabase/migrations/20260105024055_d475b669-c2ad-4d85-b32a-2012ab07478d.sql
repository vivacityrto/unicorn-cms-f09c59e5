-- ===================================
-- TGA Integration Tables and RPCs
-- ===================================
SET search_path = '';

-- 1. TGA Cache Table
CREATE TABLE IF NOT EXISTS public.tga_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_code text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('qualification', 'unit', 'skillset', 'accredited_course')),
  title text NOT NULL,
  status text NULL,
  training_package text NULL,
  release_version text NULL,
  superseded_by text NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_hash text NOT NULL,
  source_payload jsonb NULL,
  updated_by uuid NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, product_code)
);

-- 2. TGA Import Jobs Table
CREATE TABLE IF NOT EXISTS public.tga_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  codes text[] NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  rows_upserted int DEFAULT 0,
  results jsonb NULL,
  error text NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_tga_cache_tenant_product ON public.tga_cache(tenant_id, product_code);
CREATE INDEX IF NOT EXISTS idx_tga_cache_fetched_at ON public.tga_cache(tenant_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_tga_cache_product_type ON public.tga_cache(product_type);
CREATE INDEX IF NOT EXISTS idx_tga_import_jobs_tenant ON public.tga_import_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tga_import_jobs_status ON public.tga_import_jobs(status);

-- 4. Enable RLS
ALTER TABLE public.tga_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_import_jobs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for tga_cache
-- SELECT: SuperAdmin or tenant member
CREATE POLICY "tga_cache_select"
  ON public.tga_cache
  FOR SELECT
  USING (
    public.is_super_admin() OR public.has_tenant_access(tenant_id)
  );

-- No direct INSERT/UPDATE/DELETE from client - only via service role or RPCs

-- 6. RLS Policies for tga_import_jobs
-- SELECT: SuperAdmin or tenant Admin
CREATE POLICY "tga_import_jobs_select"
  ON public.tga_import_jobs
  FOR SELECT
  USING (
    public.is_super_admin() OR public.has_tenant_admin(tenant_id)
  );

-- No direct INSERT/UPDATE from client - only via RPCs

-- 7. Updated_at triggers
CREATE TRIGGER trg_tga_cache_updated_at
  BEFORE UPDATE ON public.tga_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tga_import_jobs_updated_at
  BEFORE UPDATE ON public.tga_import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Grant permissions
GRANT SELECT ON public.tga_cache TO authenticated;
GRANT SELECT ON public.tga_import_jobs TO authenticated;

-- ===================================
-- TGA Health Check RPC
-- ===================================
CREATE OR REPLACE FUNCTION public.tga_health_check(p_tenant_id bigint, p_sample_codes text[] DEFAULT ARRAY[]::text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_tables_exist boolean;
  v_rls_enabled boolean;
  v_sample_found int := 0;
  v_stale_count int := 0;
  v_total_cached int := 0;
BEGIN
  -- Check caller has admin access
  IF NOT public.is_super_admin() AND NOT public.has_tenant_admin(p_tenant_id) THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  -- Check tables exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'tga_cache'
  ) INTO v_tables_exist;

  -- Check RLS enabled
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE oid = 'public.tga_cache'::regclass;

  -- Count total cached items for tenant
  SELECT COUNT(*) INTO v_total_cached
  FROM public.tga_cache
  WHERE tenant_id = p_tenant_id;

  -- Check sample codes if provided
  IF array_length(p_sample_codes, 1) > 0 THEN
    SELECT COUNT(*) INTO v_sample_found
    FROM public.tga_cache
    WHERE tenant_id = p_tenant_id
      AND product_code = ANY(p_sample_codes);
  END IF;

  -- Count stale entries (older than 30 days)
  SELECT COUNT(*) INTO v_stale_count
  FROM public.tga_cache
  WHERE tenant_id = p_tenant_id
    AND fetched_at < (now() - interval '30 days');

  v_result := jsonb_build_object(
    'tables_exist', v_tables_exist,
    'rls_enabled', v_rls_enabled,
    'total_cached', v_total_cached,
    'sample_codes_requested', COALESCE(array_length(p_sample_codes, 1), 0),
    'sample_codes_found', v_sample_found,
    'stale_count', v_stale_count,
    'checked_at', now()
  );

  -- Log audit event
  INSERT INTO public.client_audit_log (
    tenant_id,
    entity_type,
    action,
    actor_user_id,
    details
  ) VALUES (
    p_tenant_id,
    'tga_integration',
    'health_check',
    auth.uid(),
    v_result
  );

  RETURN v_result;
END;
$$;

-- ===================================
-- TGA Queue Sync Products RPC
-- ===================================
CREATE OR REPLACE FUNCTION public.tga_queue_sync(p_tenant_id bigint, p_codes text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  -- Check caller has admin access
  IF NOT public.is_super_admin() AND NOT public.has_tenant_admin(p_tenant_id) THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  -- Validate codes array
  IF array_length(p_codes, 1) IS NULL OR array_length(p_codes, 1) = 0 THEN
    RAISE EXCEPTION 'At least one product code is required';
  END IF;

  -- Create job
  INSERT INTO public.tga_import_jobs (
    tenant_id,
    codes,
    status,
    created_by
  ) VALUES (
    p_tenant_id,
    p_codes,
    'queued',
    auth.uid()
  )
  RETURNING id INTO v_job_id;

  -- Log audit event
  INSERT INTO public.client_audit_log (
    tenant_id,
    entity_type,
    entity_id,
    action,
    actor_user_id,
    details
  ) VALUES (
    p_tenant_id,
    'tga_integration',
    v_job_id::text,
    'sync_queued',
    auth.uid(),
    jsonb_build_object('codes', p_codes, 'job_id', v_job_id)
  );

  RETURN jsonb_build_object(
    'job_id', v_job_id,
    'status', 'queued',
    'codes_count', array_length(p_codes, 1)
  );
END;
$$;

-- Grant execute on RPCs
GRANT EXECUTE ON FUNCTION public.tga_health_check(bigint, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tga_queue_sync(bigint, text[]) TO authenticated;