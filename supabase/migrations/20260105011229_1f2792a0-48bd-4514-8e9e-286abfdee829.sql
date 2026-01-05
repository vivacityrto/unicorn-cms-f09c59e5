
-- ============================================
-- STAGE-STATE MODEL: Create tenant_profile and tenant_registry_links
-- ============================================

-- 1. Create tenant_profile table for editable client fields
CREATE TABLE IF NOT EXISTS public.tenant_profile (
  tenant_id bigint PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  trading_name text,
  abn text,
  acn text,
  org_type text, -- RTO, CRICOS, GTO, combinations
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  address_line_1 text,
  address_line_2 text,
  suburb text,
  state text,
  postcode text,
  rto_number text,
  cricos_number text,
  notes text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Create tenant_registry_links table for TGA integration
CREATE TABLE IF NOT EXISTS public.tenant_registry_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  registry text NOT NULL CHECK (registry IN ('tga')),
  external_id text,
  link_status text NOT NULL DEFAULT 'not_linked' CHECK (link_status IN ('not_linked', 'pending', 'linked', 'error')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE(tenant_id, registry)
);

-- 3. Create client_audit_log for client management audit logging
CREATE TABLE IF NOT EXISTS public.client_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- 4. Add updated_at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_tenant_profile_updated_at ON public.tenant_profile;
CREATE TRIGGER set_tenant_profile_updated_at
  BEFORE UPDATE ON public.tenant_profile
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_tenant_registry_links_updated_at ON public.tenant_registry_links;
CREATE TRIGGER set_tenant_registry_links_updated_at
  BEFORE UPDATE ON public.tenant_registry_links
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 5. Enable RLS
ALTER TABLE public.tenant_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_registry_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_audit_log ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for tenant_profile
CREATE POLICY "SuperAdmin and VivacityTeam can manage all tenant profiles"
  ON public.tenant_profile
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE user_uuid = auth.uid() 
      AND unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

CREATE POLICY "Tenant users can view own profile"
  ON public.tenant_profile
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE user_uuid = auth.uid() 
      AND tenant_id = tenant_profile.tenant_id
    )
  );

-- 7. RLS Policies for tenant_registry_links
CREATE POLICY "SuperAdmin and VivacityTeam can manage registry links"
  ON public.tenant_registry_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE user_uuid = auth.uid() 
      AND unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

CREATE POLICY "Tenant users can view own registry links"
  ON public.tenant_registry_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE user_uuid = auth.uid() 
      AND tenant_id = tenant_registry_links.tenant_id
    )
  );

-- 8. RLS Policies for client_audit_log
CREATE POLICY "SuperAdmin and VivacityTeam can view all audit logs"
  ON public.client_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE user_uuid = auth.uid() 
      AND unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

CREATE POLICY "SuperAdmin and VivacityTeam can insert audit logs"
  ON public.client_audit_log
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE user_uuid = auth.uid() 
      AND unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

-- 9. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tenant_profile_tenant_id ON public.tenant_profile(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_registry_links_tenant_id ON public.tenant_registry_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_registry_links_status ON public.tenant_registry_links(link_status);
CREATE INDEX IF NOT EXISTS idx_client_audit_log_tenant_id ON public.client_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_audit_log_entity ON public.client_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_client_audit_log_created_at ON public.client_audit_log(created_at DESC);

-- 10. Backfill tenant_profile from existing users data
INSERT INTO public.tenant_profile (
  tenant_id,
  trading_name,
  abn,
  acn,
  primary_contact_name,
  primary_contact_email,
  primary_contact_phone,
  address_line_1,
  suburb,
  state,
  postcode,
  rto_number,
  cricos_number
)
SELECT DISTINCT ON (t.id)
  t.id as tenant_id,
  t.name as trading_name,
  u.abn,
  u.acn,
  CONCAT(u.first_name, ' ', u.last_name) as primary_contact_name,
  u.email as primary_contact_email,
  COALESCE(u.phone, u.mobile_phone) as primary_contact_phone,
  u.street_number_and_name as address_line_1,
  u.suburb,
  u.state::text,
  u.postcode,
  u.rto_id::text as rto_number,
  u.cricos_id as cricos_number
FROM public.tenants t
LEFT JOIN public.users u ON u.tenant_id = t.id AND u.unicorn_role = 'Admin'
WHERE NOT EXISTS (SELECT 1 FROM public.tenant_profile tp WHERE tp.tenant_id = t.id)
ORDER BY t.id, u.created_at ASC;
