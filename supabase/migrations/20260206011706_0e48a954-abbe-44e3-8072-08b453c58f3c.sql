-- Create billing_status enum
CREATE TYPE public.billing_status AS ENUM (
  'trial',
  'active', 
  'overdue',
  'suspended',
  'cancelled'
);

-- Add billing columns to tenants table
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS plan_code text,
ADD COLUMN IF NOT EXISTS plan_started_at timestamptz,
ADD COLUMN IF NOT EXISTS billing_status public.billing_status DEFAULT 'active' NOT NULL,
ADD COLUMN IF NOT EXISTS academy_access_enabled boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS compliance_system_enabled boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS resource_hub_enabled boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS documents_enabled boolean DEFAULT true NOT NULL;

-- Add consumption tracking columns
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS courses_enrolled_count integer DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS certificates_issued_count integer DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS document_downloads_count integer DEFAULT 0 NOT NULL;

-- Create index for billing status queries
CREATE INDEX IF NOT EXISTS idx_tenants_billing_status ON public.tenants(billing_status);

-- Create upgrade_attempts audit table
CREATE TABLE IF NOT EXISTS public.audit_upgrade_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_plan text NOT NULL,
  to_plan text NOT NULL,
  trigger_type text NOT NULL,
  outcome text NOT NULL,
  failure_reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for audit queries
CREATE INDEX idx_audit_upgrade_attempts_tenant ON public.audit_upgrade_attempts(tenant_id);
CREATE INDEX idx_audit_upgrade_attempts_actor ON public.audit_upgrade_attempts(actor_user_id);
CREATE INDEX idx_audit_upgrade_attempts_created ON public.audit_upgrade_attempts(created_at DESC);

-- Enable RLS
ALTER TABLE public.audit_upgrade_attempts ENABLE ROW LEVEL SECURITY;

-- Only staff can view upgrade attempt logs
CREATE POLICY "Staff can view upgrade attempt logs"
ON public.audit_upgrade_attempts
FOR SELECT
TO authenticated
USING (public.is_staff());

-- All authenticated users can create upgrade attempt logs
CREATE POLICY "Users can create upgrade attempt logs"
ON public.audit_upgrade_attempts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = actor_user_id);

-- Update existing academy tenants to enable academy access
UPDATE public.tenants
SET 
  academy_access_enabled = true,
  compliance_system_enabled = false,
  resource_hub_enabled = false,
  documents_enabled = false
WHERE tenant_type IN ('academy_solo', 'academy_team', 'academy_elite');

-- Update compliance system tenants to enable all features
UPDATE public.tenants
SET 
  academy_access_enabled = true,
  compliance_system_enabled = true,
  resource_hub_enabled = true,
  documents_enabled = true
WHERE tenant_type = 'compliance_system';