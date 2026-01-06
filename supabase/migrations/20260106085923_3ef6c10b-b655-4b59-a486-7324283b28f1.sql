-- Create tenant_merge_data table to store client-supplied merge field data
CREATE TABLE public.tenant_merge_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_merge_data_tenant_unique UNIQUE (tenant_id)
);

-- Enable RLS
ALTER TABLE public.tenant_merge_data ENABLE ROW LEVEL SECURITY;

-- Tenant users can read their own tenant's merge data
CREATE POLICY "Tenant users can read own merge data"
ON public.tenant_merge_data
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = tenant_merge_data.tenant_id
    AND tu.user_id = auth.uid()
  )
);

-- Tenant users can insert their own tenant's merge data
CREATE POLICY "Tenant users can insert own merge data"
ON public.tenant_merge_data
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = tenant_merge_data.tenant_id
    AND tu.user_id = auth.uid()
  )
);

-- Tenant users can update their own tenant's merge data
CREATE POLICY "Tenant users can update own merge data"
ON public.tenant_merge_data
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = tenant_merge_data.tenant_id
    AND tu.user_id = auth.uid()
  )
);

-- SuperAdmins can read all merge data for support
CREATE POLICY "SuperAdmins can read all merge data"
ON public.tenant_merge_data
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
    AND u.role = 'super_admin'
  )
);

-- SuperAdmins can manage all merge data
CREATE POLICY "SuperAdmins can manage all merge data"
ON public.tenant_merge_data
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
    AND u.role = 'super_admin'
  )
);

-- Create index for faster lookups
CREATE INDEX idx_tenant_merge_data_tenant_id ON public.tenant_merge_data(tenant_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_tenant_merge_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tenant_merge_data_timestamp
BEFORE UPDATE ON public.tenant_merge_data
FOR EACH ROW
EXECUTE FUNCTION public.update_tenant_merge_data_updated_at();