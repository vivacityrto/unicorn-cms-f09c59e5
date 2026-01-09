-- TGA REST API Integration Tables (adapted for bigint tenant_id)

-- 1. TGA RTO Snapshots - stores full organization data from TGA REST API
CREATE TABLE IF NOT EXISTS public.tga_rto_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rto_id TEXT NOT NULL,
  source_url TEXT,
  raw_sha256 TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tenant RTO Scope - unified scope table for all component types
CREATE TABLE IF NOT EXISTS public.tenant_rto_scope (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  scope_type TEXT NOT NULL CHECK (scope_type IN ('qualification', 'unit', 'skillset', 'accreditedCourse')),
  status TEXT DEFAULT 'current',
  is_superseded BOOLEAN DEFAULT FALSE,
  superseded_by TEXT,
  tga_data JSONB,
  last_refreshed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT tenant_rto_scope_unique_code UNIQUE (tenant_id, code, scope_type)
);

-- 3. TGA Cache - caches product details for faster lookups
CREATE TABLE IF NOT EXISTS public.tga_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  product_title TEXT,
  product_type TEXT,
  release_status TEXT,
  release_date TEXT,
  superseded_date TEXT,
  superseded_by TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  checksum TEXT,
  tga_metadata JSONB,
  CONSTRAINT tga_cache_unique UNIQUE (tenant_id, product_code)
);

-- 4. TGA REST Sync Jobs - tracks sync job status for REST API calls
CREATE TABLE IF NOT EXISTS public.tga_rest_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rto_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  last_error TEXT,
  scope_counts JSONB DEFAULT '{}',
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add TGA REST API fields to tenants table (if not exist)
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS tga_connected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tga_last_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tga_status TEXT DEFAULT 'disconnected',
ADD COLUMN IF NOT EXISTS tga_legal_name TEXT,
ADD COLUMN IF NOT EXISTS tga_snapshot JSONB;

-- Enable RLS
ALTER TABLE public.tga_rto_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_rto_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_rest_sync_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for superadmins and tenant members
CREATE POLICY "tga_rto_snapshots_superadmin" ON public.tga_rto_snapshots
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.role = 'superadmin')
    OR tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active')
  );

CREATE POLICY "tenant_rto_scope_access" ON public.tenant_rto_scope
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.role = 'superadmin')
    OR tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active')
  );

CREATE POLICY "tga_cache_access" ON public.tga_cache
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.role = 'superadmin')
    OR tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active')
  );

CREATE POLICY "tga_rest_sync_jobs_access" ON public.tga_rest_sync_jobs
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.role = 'superadmin')
    OR tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active')
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tga_rto_snapshots_tenant ON public.tga_rto_snapshots(tenant_id, rto_id);
CREATE INDEX IF NOT EXISTS idx_tenant_rto_scope_tenant_code ON public.tenant_rto_scope(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_tenant_rto_scope_type ON public.tenant_rto_scope(tenant_id, scope_type);
CREATE INDEX IF NOT EXISTS idx_tga_cache_tenant_code ON public.tga_cache(tenant_id, product_code);
CREATE INDEX IF NOT EXISTS idx_tga_rest_sync_jobs_tenant ON public.tga_rest_sync_jobs(tenant_id, status);

-- RPC: Persist TGA scope items from REST API
CREATE OR REPLACE FUNCTION public.persist_tga_scope_items(
  p_tenant_id BIGINT,
  p_scope_type TEXT,
  p_scope_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted_count INT := 0;
  _item JSONB;
BEGIN
  IF p_scope_type NOT IN ('qualification', 'unit', 'skillset', 'accreditedCourse') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid scope_type');
  END IF;
  
  FOR _item IN SELECT * FROM jsonb_array_elements(p_scope_items)
  LOOP
    INSERT INTO public.tenant_rto_scope (
      id, tenant_id, code, title, scope_type, status, is_superseded, superseded_by, tga_data, last_refreshed_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      p_tenant_id,
      COALESCE(_item->>'code', _item->>'Code', ''),
      COALESCE(_item->>'title', _item->>'Title', _item->>'name', ''),
      p_scope_type,
      COALESCE(_item->>'statusLabel', _item->>'status', 'current'),
      COALESCE((_item->>'isSuperseded')::boolean, false),
      _item->>'supersededBy',
      _item,
      NOW(),
      NOW()
    )
    ON CONFLICT (tenant_id, code, scope_type) 
    DO UPDATE SET
      title = EXCLUDED.title,
      status = EXCLUDED.status,
      is_superseded = EXCLUDED.is_superseded,
      superseded_by = EXCLUDED.superseded_by,
      tga_data = EXCLUDED.tga_data,
      last_refreshed_at = NOW(),
      updated_at = NOW();
    
    _inserted_count := _inserted_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object('success', true, 'items_persisted', _inserted_count);
END;
$$;

-- RPC: Get tenant scope items
CREATE OR REPLACE FUNCTION public.get_tenant_scope_items(
  p_tenant_id BIGINT,
  p_scope_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  title TEXT,
  scope_type TEXT,
  status TEXT,
  is_superseded BOOLEAN,
  superseded_by TEXT,
  last_refreshed_at TIMESTAMPTZ,
  tga_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.code,
    s.title,
    s.scope_type,
    s.status,
    s.is_superseded,
    s.superseded_by,
    s.last_refreshed_at,
    s.tga_data
  FROM public.tenant_rto_scope s
  WHERE s.tenant_id = p_tenant_id
    AND (p_scope_type IS NULL OR s.scope_type = p_scope_type)
  ORDER BY s.code;
END;
$$;

-- RPC: Get tenant scope sync status
CREATE OR REPLACE FUNCTION public.get_tenant_scope_sync_status(p_tenant_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _qualification_count INT;
  _unit_count INT;
  _skillset_count INT;
  _course_count INT;
  _last_synced TIMESTAMPTZ;
BEGIN
  SELECT 
    COUNT(*) FILTER (WHERE scope_type = 'qualification'),
    COUNT(*) FILTER (WHERE scope_type = 'unit'),
    COUNT(*) FILTER (WHERE scope_type = 'skillset'),
    COUNT(*) FILTER (WHERE scope_type = 'accreditedCourse'),
    MAX(last_refreshed_at)
  INTO _qualification_count, _unit_count, _skillset_count, _course_count, _last_synced
  FROM public.tenant_rto_scope
  WHERE tenant_id = p_tenant_id;
  
  RETURN jsonb_build_object(
    'qualifications', COALESCE(_qualification_count, 0),
    'units', COALESCE(_unit_count, 0),
    'skillsets', COALESCE(_skillset_count, 0),
    'courses', COALESCE(_course_count, 0),
    'total', COALESCE(_qualification_count, 0) + COALESCE(_unit_count, 0) + COALESCE(_skillset_count, 0) + COALESCE(_course_count, 0),
    'last_synced_at', _last_synced
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.persist_tga_scope_items(BIGINT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_scope_items(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_scope_sync_status(BIGINT) TO authenticated;