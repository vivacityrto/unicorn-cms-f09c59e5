-- Create enum for tenant types
CREATE TYPE public.tenant_type AS ENUM (
  'compliance_system',      -- Full platform access
  'academy_solo',           -- Single user, training only
  'academy_team',           -- Up to 10 users
  'academy_elite'           -- Up to 30 users
);

-- Add tenant_type column to tenants table
ALTER TABLE public.tenants 
ADD COLUMN tenant_type public.tenant_type 
DEFAULT 'compliance_system' NOT NULL;

-- Add Academy-specific fields to tenants
ALTER TABLE public.tenants
ADD COLUMN academy_max_users integer DEFAULT NULL,
ADD COLUMN academy_subscription_expires_at timestamptz DEFAULT NULL;

-- Add index for tenant_type queries
CREATE INDEX idx_tenants_tenant_type ON public.tenants(tenant_type);

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.tenant_type IS 'Determines navigation and feature access: compliance_system (full), academy_solo (1 user), academy_team (10 users), academy_elite (30 users)';