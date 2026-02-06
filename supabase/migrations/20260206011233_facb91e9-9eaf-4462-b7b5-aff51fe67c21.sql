-- Create audit table for client impersonation events
CREATE TABLE IF NOT EXISTS public.audit_client_impersonation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add index for querying by tenant and actor
CREATE INDEX idx_audit_client_impersonation_tenant ON public.audit_client_impersonation(tenant_id);
CREATE INDEX idx_audit_client_impersonation_actor ON public.audit_client_impersonation(actor_user_id);
CREATE INDEX idx_audit_client_impersonation_started ON public.audit_client_impersonation(started_at DESC);

-- Enable RLS
ALTER TABLE public.audit_client_impersonation ENABLE ROW LEVEL SECURITY;

-- Only Vivacity staff can view impersonation logs
CREATE POLICY "Staff can view impersonation logs"
ON public.audit_client_impersonation
FOR SELECT
TO authenticated
USING (public.is_staff());

-- Only Vivacity staff can create impersonation logs
CREATE POLICY "Staff can create impersonation logs"
ON public.audit_client_impersonation
FOR INSERT
TO authenticated
WITH CHECK (public.is_staff());

-- Only Vivacity staff can update their own impersonation logs (to set ended_at)
CREATE POLICY "Staff can update own impersonation logs"
ON public.audit_client_impersonation
FOR UPDATE
TO authenticated
USING (public.is_staff() AND actor_user_id = auth.uid());