-- ===================================
-- TGA Production Integration Tables
-- Enhanced schema for training.gov.au SOAP services
-- ===================================
SET search_path = '';

-- 1. TGA Training Products (Qualifications, Skill Sets)
CREATE TABLE IF NOT EXISTS public.tga_training_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('qualification', 'skillset', 'accredited_course', 'training_package')),
  training_package_code text NULL,
  training_package_title text NULL,
  status text NULL,
  release_number text NULL,
  release_date date NULL,
  currency_status text NULL,
  superseded_by text NULL,
  is_current boolean DEFAULT true,
  source_hash text NOT NULL,
  source_payload jsonb NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. TGA Units of Competency
CREATE TABLE IF NOT EXISTS public.tga_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  usage_recommendation text NULL,
  training_package_code text NULL,
  training_package_title text NULL,
  status text NULL,
  release_number text NULL,
  release_date date NULL,
  currency_status text NULL,
  superseded_by text NULL,
  is_current boolean DEFAULT true,
  nominal_hours numeric NULL,
  source_hash text NOT NULL,
  source_payload jsonb NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. TGA Organisations (RTOs)
CREATE TABLE IF NOT EXISTS public.tga_organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  trading_name text NULL,
  organisation_type text NULL,
  abn text NULL,
  status text NULL,
  registration_start_date date NULL,
  registration_end_date date NULL,
  address_line1 text NULL,
  address_line2 text NULL,
  suburb text NULL,
  state text NULL,
  postcode text NULL,
  country text NULL,
  phone text NULL,
  email text NULL,
  website text NULL,
  source_hash text NOT NULL,
  source_payload jsonb NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. TGA Sync Jobs (Enhanced)
DROP TABLE IF EXISTS public.tga_sync_jobs CASCADE;
CREATE TABLE public.tga_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN ('full', 'delta', 'products', 'units', 'organisations')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  delta_since timestamptz NULL,
  records_fetched int DEFAULT 0,
  records_inserted int DEFAULT 0,
  records_updated int DEFAULT 0,
  records_unchanged int DEFAULT 0,
  records_failed int DEFAULT 0,
  error_message text NULL,
  error_details jsonb NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. TGA Sync Status (singleton for quick status lookups)
CREATE TABLE IF NOT EXISTS public.tga_sync_status (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_full_sync_at timestamptz NULL,
  last_delta_sync_at timestamptz NULL,
  last_sync_job_id uuid NULL REFERENCES public.tga_sync_jobs(id),
  products_count int DEFAULT 0,
  units_count int DEFAULT 0,
  organisations_count int DEFAULT 0,
  is_syncing boolean DEFAULT false,
  current_job_id uuid NULL REFERENCES public.tga_sync_jobs(id),
  connection_status text DEFAULT 'unknown' CHECK (connection_status IN ('unknown', 'connected', 'error')),
  last_health_check_at timestamptz NULL,
  last_health_check_result jsonb NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert initial status row
INSERT INTO public.tga_sync_status (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_tga_training_products_code ON public.tga_training_products(code);
CREATE INDEX IF NOT EXISTS idx_tga_training_products_type ON public.tga_training_products(product_type);
CREATE INDEX IF NOT EXISTS idx_tga_training_products_package ON public.tga_training_products(training_package_code);
CREATE INDEX IF NOT EXISTS idx_tga_training_products_current ON public.tga_training_products(is_current);
CREATE INDEX IF NOT EXISTS idx_tga_training_products_fetched ON public.tga_training_products(fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_tga_units_code ON public.tga_units(code);
CREATE INDEX IF NOT EXISTS idx_tga_units_package ON public.tga_units(training_package_code);
CREATE INDEX IF NOT EXISTS idx_tga_units_current ON public.tga_units(is_current);
CREATE INDEX IF NOT EXISTS idx_tga_units_fetched ON public.tga_units(fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_tga_organisations_code ON public.tga_organisations(code);
CREATE INDEX IF NOT EXISTS idx_tga_organisations_status ON public.tga_organisations(status);
CREATE INDEX IF NOT EXISTS idx_tga_organisations_fetched ON public.tga_organisations(fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_tga_sync_jobs_status ON public.tga_sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_tga_sync_jobs_created ON public.tga_sync_jobs(created_at DESC);

-- 7. Enable RLS
ALTER TABLE public.tga_training_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_sync_status ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies - TGA data is shared (read-only for authenticated users)

-- Training Products: All authenticated users can read
CREATE POLICY "tga_training_products_select"
  ON public.tga_training_products FOR SELECT
  USING (auth.role() = 'authenticated');

-- Units: All authenticated users can read
CREATE POLICY "tga_units_select"
  ON public.tga_units FOR SELECT
  USING (auth.role() = 'authenticated');

-- Organisations: All authenticated users can read
CREATE POLICY "tga_organisations_select"
  ON public.tga_organisations FOR SELECT
  USING (auth.role() = 'authenticated');

-- Sync Jobs: Only SuperAdmin can see
CREATE POLICY "tga_sync_jobs_select"
  ON public.tga_sync_jobs FOR SELECT
  USING (public.is_super_admin());

-- Sync Status: Only SuperAdmin can see
CREATE POLICY "tga_sync_status_select"
  ON public.tga_sync_status FOR SELECT
  USING (public.is_super_admin());

-- 9. Updated_at triggers
CREATE TRIGGER trg_tga_training_products_updated_at
  BEFORE UPDATE ON public.tga_training_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tga_units_updated_at
  BEFORE UPDATE ON public.tga_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tga_organisations_updated_at
  BEFORE UPDATE ON public.tga_organisations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tga_sync_jobs_updated_at
  BEFORE UPDATE ON public.tga_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tga_sync_status_updated_at
  BEFORE UPDATE ON public.tga_sync_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. Grant permissions
GRANT SELECT ON public.tga_training_products TO authenticated;
GRANT SELECT ON public.tga_units TO authenticated;
GRANT SELECT ON public.tga_organisations TO authenticated;
GRANT SELECT ON public.tga_sync_jobs TO authenticated;
GRANT SELECT ON public.tga_sync_status TO authenticated;

-- ===================================
-- TGA RPC Functions
-- ===================================

-- Health Check RPC
CREATE OR REPLACE FUNCTION public.tga_health_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_products_count int;
  v_units_count int;
  v_orgs_count int;
  v_stale_products int;
  v_stale_units int;
BEGIN
  -- Only SuperAdmin can run health check
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: SuperAdmin role required';
  END IF;

  -- Count records
  SELECT COUNT(*) INTO v_products_count FROM public.tga_training_products;
  SELECT COUNT(*) INTO v_units_count FROM public.tga_units;
  SELECT COUNT(*) INTO v_orgs_count FROM public.tga_organisations;

  -- Count stale records (older than 30 days)
  SELECT COUNT(*) INTO v_stale_products 
  FROM public.tga_training_products 
  WHERE fetched_at < (now() - interval '30 days');

  SELECT COUNT(*) INTO v_stale_units 
  FROM public.tga_units 
  WHERE fetched_at < (now() - interval '30 days');

  v_result := jsonb_build_object(
    'status', 'ok',
    'checked_at', now(),
    'counts', jsonb_build_object(
      'training_products', v_products_count,
      'units', v_units_count,
      'organisations', v_orgs_count
    ),
    'stale_records', jsonb_build_object(
      'training_products', v_stale_products,
      'units', v_stale_units
    ),
    'tables_exist', jsonb_build_object(
      'tga_training_products', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tga_training_products'),
      'tga_units', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tga_units'),
      'tga_organisations', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tga_organisations')
    )
  );

  -- Update sync status
  UPDATE public.tga_sync_status SET
    last_health_check_at = now(),
    last_health_check_result = v_result,
    products_count = v_products_count,
    units_count = v_units_count,
    organisations_count = v_orgs_count,
    connection_status = 'connected'
  WHERE id = 1;

  -- Log audit
  INSERT INTO public.client_audit_log (
    tenant_id,
    entity_type,
    action,
    actor_user_id,
    details
  ) VALUES (
    1, -- System-level audit
    'tga_integration',
    'health_check',
    auth.uid(),
    v_result
  );

  RETURN v_result;
END;
$$;

-- Sync Status RPC
CREATE OR REPLACE FUNCTION public.tga_sync_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status record;
  v_last_job record;
BEGIN
  -- Only SuperAdmin can view sync status
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: SuperAdmin role required';
  END IF;

  SELECT * INTO v_status FROM public.tga_sync_status WHERE id = 1;

  IF v_status.last_sync_job_id IS NOT NULL THEN
    SELECT * INTO v_last_job FROM public.tga_sync_jobs WHERE id = v_status.last_sync_job_id;
  END IF;

  RETURN jsonb_build_object(
    'is_syncing', COALESCE(v_status.is_syncing, false),
    'current_job_id', v_status.current_job_id,
    'last_full_sync_at', v_status.last_full_sync_at,
    'last_delta_sync_at', v_status.last_delta_sync_at,
    'last_health_check_at', v_status.last_health_check_at,
    'connection_status', v_status.connection_status,
    'counts', jsonb_build_object(
      'products', COALESCE(v_status.products_count, 0),
      'units', COALESCE(v_status.units_count, 0),
      'organisations', COALESCE(v_status.organisations_count, 0)
    ),
    'last_job', CASE WHEN v_last_job.id IS NOT NULL THEN jsonb_build_object(
      'id', v_last_job.id,
      'job_type', v_last_job.job_type,
      'status', v_last_job.status,
      'started_at', v_last_job.started_at,
      'completed_at', v_last_job.completed_at,
      'records_fetched', v_last_job.records_fetched,
      'records_inserted', v_last_job.records_inserted,
      'records_updated', v_last_job.records_updated,
      'error_message', v_last_job.error_message
    ) ELSE null END
  );
END;
$$;

-- Queue Full Sync RPC
CREATE OR REPLACE FUNCTION public.tga_sync_full()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job_id uuid;
  v_is_syncing boolean;
BEGIN
  -- Only SuperAdmin can trigger sync
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: SuperAdmin role required';
  END IF;

  -- Check if already syncing
  SELECT is_syncing INTO v_is_syncing FROM public.tga_sync_status WHERE id = 1;
  IF v_is_syncing THEN
    RAISE EXCEPTION 'A sync is already in progress';
  END IF;

  -- Create job
  INSERT INTO public.tga_sync_jobs (job_type, status, created_by)
  VALUES ('full', 'queued', auth.uid())
  RETURNING id INTO v_job_id;

  -- Update status
  UPDATE public.tga_sync_status SET
    is_syncing = true,
    current_job_id = v_job_id
  WHERE id = 1;

  -- Log audit
  INSERT INTO public.client_audit_log (
    tenant_id,
    entity_type,
    entity_id,
    action,
    actor_user_id,
    details
  ) VALUES (
    1,
    'tga_integration',
    v_job_id::text,
    'sync_full_queued',
    auth.uid(),
    jsonb_build_object('job_id', v_job_id)
  );

  RETURN jsonb_build_object(
    'job_id', v_job_id,
    'status', 'queued',
    'job_type', 'full'
  );
END;
$$;

-- Queue Delta Sync RPC
CREATE OR REPLACE FUNCTION public.tga_sync_delta(p_since timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job_id uuid;
  v_is_syncing boolean;
  v_since timestamptz;
BEGIN
  -- Only SuperAdmin can trigger sync
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: SuperAdmin role required';
  END IF;

  -- Check if already syncing
  SELECT is_syncing INTO v_is_syncing FROM public.tga_sync_status WHERE id = 1;
  IF v_is_syncing THEN
    RAISE EXCEPTION 'A sync is already in progress';
  END IF;

  -- Default to last delta sync or 24 hours ago
  SELECT COALESCE(p_since, last_delta_sync_at, now() - interval '24 hours') 
  INTO v_since 
  FROM public.tga_sync_status WHERE id = 1;

  -- Create job
  INSERT INTO public.tga_sync_jobs (job_type, status, delta_since, created_by)
  VALUES ('delta', 'queued', v_since, auth.uid())
  RETURNING id INTO v_job_id;

  -- Update status
  UPDATE public.tga_sync_status SET
    is_syncing = true,
    current_job_id = v_job_id
  WHERE id = 1;

  -- Log audit
  INSERT INTO public.client_audit_log (
    tenant_id,
    entity_type,
    entity_id,
    action,
    actor_user_id,
    details
  ) VALUES (
    1,
    'tga_integration',
    v_job_id::text,
    'sync_delta_queued',
    auth.uid(),
    jsonb_build_object('job_id', v_job_id, 'since', v_since)
  );

  RETURN jsonb_build_object(
    'job_id', v_job_id,
    'status', 'queued',
    'job_type', 'delta',
    'since', v_since
  );
END;
$$;

-- Grant execute on RPCs
GRANT EXECUTE ON FUNCTION public.tga_health_check() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tga_sync_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tga_sync_full() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tga_sync_delta(timestamptz) TO authenticated;