-- =====================================================
-- TGA Organisation Data Tables for Client Integration
-- Stores imported data from Training.gov.au per tenant
-- =====================================================

-- Organisation summary
CREATE TABLE IF NOT EXISTS public.tga_rto_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rto_code text NOT NULL,
  legal_name text,
  trading_name text,
  organisation_type text,
  abn text,
  status text,
  registration_start_date date,
  registration_end_date date,
  source_hash text,
  source_payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, rto_code)
);

-- Organisation contacts
CREATE TABLE IF NOT EXISTS public.tga_rto_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rto_code text NOT NULL,
  contact_type text,
  name text,
  position text,
  phone text,
  email text,
  source_payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Head office address
CREATE TABLE IF NOT EXISTS public.tga_rto_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rto_code text NOT NULL,
  address_type text NOT NULL DEFAULT 'head_office',
  address_line_1 text,
  address_line_2 text,
  suburb text,
  state text,
  postcode text,
  country text,
  phone text,
  fax text,
  email text,
  website text,
  source_payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Delivery locations
CREATE TABLE IF NOT EXISTS public.tga_rto_delivery_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rto_code text NOT NULL,
  location_name text,
  address_line_1 text,
  address_line_2 text,
  suburb text,
  state text,
  postcode text,
  country text,
  source_payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Scope: Qualifications
CREATE TABLE IF NOT EXISTS public.tga_scope_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rto_code text NOT NULL,
  qualification_code text NOT NULL,
  qualification_title text,
  training_package_code text,
  training_package_title text,
  scope_start_date date,
  scope_end_date date,
  status text,
  is_current boolean DEFAULT true,
  source_payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, rto_code, qualification_code)
);

-- Scope: Skill sets
CREATE TABLE IF NOT EXISTS public.tga_scope_skillsets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rto_code text NOT NULL,
  skillset_code text NOT NULL,
  skillset_title text,
  training_package_code text,
  training_package_title text,
  scope_start_date date,
  scope_end_date date,
  status text,
  is_current boolean DEFAULT true,
  source_payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, rto_code, skillset_code)
);

-- Scope: Units (explicit only)
CREATE TABLE IF NOT EXISTS public.tga_scope_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rto_code text NOT NULL,
  unit_code text NOT NULL,
  unit_title text,
  training_package_code text,
  training_package_title text,
  scope_start_date date,
  scope_end_date date,
  status text,
  is_current boolean DEFAULT true,
  is_explicit boolean DEFAULT true,
  source_payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, rto_code, unit_code)
);

-- Scope: Accredited courses
CREATE TABLE IF NOT EXISTS public.tga_scope_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rto_code text NOT NULL,
  course_code text NOT NULL,
  course_title text,
  scope_start_date date,
  scope_end_date date,
  status text,
  is_current boolean DEFAULT true,
  source_payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, rto_code, course_code)
);

-- TGA import jobs per tenant
CREATE TABLE IF NOT EXISTS public.tga_rto_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rto_code text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  job_type text NOT NULL DEFAULT 'full',
  started_at timestamptz,
  completed_at timestamptz,
  summary_fetched boolean DEFAULT false,
  contacts_fetched boolean DEFAULT false,
  addresses_fetched boolean DEFAULT false,
  scope_fetched boolean DEFAULT false,
  qualifications_count integer DEFAULT 0,
  skillsets_count integer DEFAULT 0,
  units_count integer DEFAULT 0,
  courses_count integer DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Enable RLS on all tables
ALTER TABLE public.tga_rto_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_rto_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_rto_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_rto_delivery_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_scope_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_scope_skillsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_scope_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_scope_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_rto_import_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies: Users can view their own tenant's TGA data
CREATE POLICY "Users can view own tenant TGA summary" ON public.tga_rto_summary
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND (tenant_id = tga_rto_summary.tenant_id OR global_role = 'SuperAdmin'))
  );

CREATE POLICY "Users can view own tenant TGA contacts" ON public.tga_rto_contacts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND (tenant_id = tga_rto_contacts.tenant_id OR global_role = 'SuperAdmin'))
  );

CREATE POLICY "Users can view own tenant TGA addresses" ON public.tga_rto_addresses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND (tenant_id = tga_rto_addresses.tenant_id OR global_role = 'SuperAdmin'))
  );

CREATE POLICY "Users can view own tenant TGA delivery locations" ON public.tga_rto_delivery_locations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND (tenant_id = tga_rto_delivery_locations.tenant_id OR global_role = 'SuperAdmin'))
  );

CREATE POLICY "Users can view own tenant TGA qualifications" ON public.tga_scope_qualifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND (tenant_id = tga_scope_qualifications.tenant_id OR global_role = 'SuperAdmin'))
  );

CREATE POLICY "Users can view own tenant TGA skillsets" ON public.tga_scope_skillsets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND (tenant_id = tga_scope_skillsets.tenant_id OR global_role = 'SuperAdmin'))
  );

CREATE POLICY "Users can view own tenant TGA units" ON public.tga_scope_units
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND (tenant_id = tga_scope_units.tenant_id OR global_role = 'SuperAdmin'))
  );

CREATE POLICY "Users can view own tenant TGA courses" ON public.tga_scope_courses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND (tenant_id = tga_scope_courses.tenant_id OR global_role = 'SuperAdmin'))
  );

CREATE POLICY "Users can view own tenant TGA import jobs" ON public.tga_rto_import_jobs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND (tenant_id = tga_rto_import_jobs.tenant_id OR global_role = 'SuperAdmin'))
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tga_rto_summary_tenant ON public.tga_rto_summary(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tga_rto_contacts_tenant ON public.tga_rto_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tga_rto_addresses_tenant ON public.tga_rto_addresses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tga_rto_delivery_tenant ON public.tga_rto_delivery_locations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tga_scope_quals_tenant ON public.tga_scope_qualifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tga_scope_skills_tenant ON public.tga_scope_skillsets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tga_scope_units_tenant ON public.tga_scope_units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tga_scope_courses_tenant ON public.tga_scope_courses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tga_rto_import_tenant ON public.tga_rto_import_jobs(tenant_id);

-- Update the client_tga_link_set function to trigger import on auto-verify
CREATE OR REPLACE FUNCTION public.client_tga_link_set(p_tenant_id bigint, p_rto_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_is_admin boolean;
  v_new_status text;
  v_auto_verified boolean := false;
  v_link_id uuid;
  v_import_job_id uuid;
BEGIN
  -- Get actor
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check actor role
  SELECT global_role INTO v_actor_role
  FROM public.users
  WHERE user_uuid = v_actor_id;

  v_is_admin := v_actor_role IN ('SuperAdmin', 'Admin');

  -- Determine status based on role
  IF v_is_admin THEN
    v_new_status := 'linked';
    v_auto_verified := true;
  ELSE
    v_new_status := 'pending';
    v_auto_verified := false;
  END IF;

  -- Upsert the registry link
  INSERT INTO public.tenant_registry_links (
    tenant_id, registry, external_id, link_status, 
    verified_at, verified_by, updated_by
  )
  VALUES (
    p_tenant_id, 'tga', p_rto_number, v_new_status,
    CASE WHEN v_auto_verified THEN now() ELSE NULL END,
    CASE WHEN v_auto_verified THEN v_actor_id ELSE NULL END,
    v_actor_id
  )
  ON CONFLICT (tenant_id, registry) DO UPDATE SET
    external_id = EXCLUDED.external_id,
    link_status = EXCLUDED.link_status,
    verified_at = EXCLUDED.verified_at,
    verified_by = EXCLUDED.verified_by,
    updated_by = EXCLUDED.updated_by,
    updated_at = now()
  RETURNING id INTO v_link_id;

  -- Audit: link set
  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, details
  ) VALUES (
    p_tenant_id, v_actor_id, 'tga.link.set', 'tenant_registry_links', v_link_id::text,
    jsonb_build_object(
      'rto_number', p_rto_number,
      'status', v_new_status,
      'auto_verified', v_auto_verified,
      'actor_role', v_actor_role
    )
  );

  -- If auto-verified, also log verification and create import job
  IF v_auto_verified THEN
    INSERT INTO public.client_audit_log (
      tenant_id, actor_user_id, action, entity_type, entity_id, details
    ) VALUES (
      p_tenant_id, v_actor_id, 'tga.link.verified', 'tenant_registry_links', v_link_id::text,
      jsonb_build_object(
        'rto_number', p_rto_number,
        'verification_type', 'auto',
        'actor_role', v_actor_role
      )
    );

    -- Create import job
    INSERT INTO public.tga_rto_import_jobs (
      tenant_id, rto_code, status, job_type, created_by
    ) VALUES (
      p_tenant_id, p_rto_number, 'queued', 'full', v_actor_id
    ) RETURNING id INTO v_import_job_id;

    -- Audit: import started
    INSERT INTO public.client_audit_log (
      tenant_id, actor_user_id, action, entity_type, entity_id, details
    ) VALUES (
      p_tenant_id, v_actor_id, 'tga.import.queued', 'tga_rto_import_jobs', v_import_job_id::text,
      jsonb_build_object('rto_number', p_rto_number, 'job_type', 'full')
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_new_status,
    'auto_verified', v_auto_verified,
    'link_id', v_link_id,
    'import_job_id', v_import_job_id
  );
END;
$$;

-- Update the client_tga_link_verify function to also trigger import
CREATE OR REPLACE FUNCTION public.client_tga_link_verify(p_tenant_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_link_id uuid;
  v_rto_number text;
  v_import_job_id uuid;
BEGIN
  -- Get actor
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check actor role - only SuperAdmin/Admin can verify
  SELECT global_role INTO v_actor_role
  FROM public.users
  WHERE user_uuid = v_actor_id;

  IF v_actor_role NOT IN ('SuperAdmin', 'Admin') THEN
    RAISE EXCEPTION 'Admin privileges required to verify TGA link';
  END IF;

  -- Get the existing link
  SELECT id, external_id INTO v_link_id, v_rto_number
  FROM public.tenant_registry_links
  WHERE tenant_id = p_tenant_id AND registry = 'tga';

  IF v_link_id IS NULL THEN
    RAISE EXCEPTION 'No TGA link found for this tenant';
  END IF;

  -- Update to linked
  UPDATE public.tenant_registry_links
  SET link_status = 'linked',
      verified_at = now(),
      verified_by = v_actor_id,
      updated_by = v_actor_id,
      updated_at = now()
  WHERE id = v_link_id;

  -- Audit: verification
  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, details
  ) VALUES (
    p_tenant_id, v_actor_id, 'tga.link.verified', 'tenant_registry_links', v_link_id::text,
    jsonb_build_object(
      'rto_number', v_rto_number,
      'verification_type', 'manual',
      'actor_role', v_actor_role
    )
  );

  -- Create import job
  INSERT INTO public.tga_rto_import_jobs (
    tenant_id, rto_code, status, job_type, created_by
  ) VALUES (
    p_tenant_id, v_rto_number, 'queued', 'full', v_actor_id
  ) RETURNING id INTO v_import_job_id;

  -- Audit: import queued
  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, details
  ) VALUES (
    p_tenant_id, v_actor_id, 'tga.import.queued', 'tga_rto_import_jobs', v_import_job_id::text,
    jsonb_build_object('rto_number', v_rto_number, 'job_type', 'full')
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'linked',
    'link_id', v_link_id,
    'import_job_id', v_import_job_id
  );
END;
$$;

-- RPC to trigger a sync for a linked tenant
CREATE OR REPLACE FUNCTION public.tga_trigger_sync(p_tenant_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_rto_number text;
  v_link_status text;
  v_import_job_id uuid;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check actor role
  SELECT global_role INTO v_actor_role
  FROM public.users
  WHERE user_uuid = v_actor_id;

  IF v_actor_role NOT IN ('SuperAdmin', 'Admin') THEN
    RAISE EXCEPTION 'Admin privileges required to trigger sync';
  END IF;

  -- Get link info
  SELECT external_id, link_status INTO v_rto_number, v_link_status
  FROM public.tenant_registry_links
  WHERE tenant_id = p_tenant_id AND registry = 'tga';

  IF v_rto_number IS NULL THEN
    RAISE EXCEPTION 'No TGA link found for this tenant';
  END IF;

  IF v_link_status != 'linked' THEN
    RAISE EXCEPTION 'TGA link must be verified before syncing';
  END IF;

  -- Create import job
  INSERT INTO public.tga_rto_import_jobs (
    tenant_id, rto_code, status, job_type, created_by
  ) VALUES (
    p_tenant_id, v_rto_number, 'queued', 'full', v_actor_id
  ) RETURNING id INTO v_import_job_id;

  -- Audit
  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, details
  ) VALUES (
    p_tenant_id, v_actor_id, 'tga.import.queued', 'tga_rto_import_jobs', v_import_job_id::text,
    jsonb_build_object('rto_number', v_rto_number, 'job_type', 'full', 'trigger', 'manual')
  );

  RETURN jsonb_build_object(
    'success', true,
    'import_job_id', v_import_job_id,
    'rto_number', v_rto_number
  );
END;
$$;