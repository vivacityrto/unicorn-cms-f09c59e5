-- Create table for connected tenants
CREATE TABLE IF NOT EXISTS public.connected_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_name TEXT NOT NULL,
  email TEXT NOT NULL,
  connected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_uuid, tenant_id)
);

-- Enable RLS
ALTER TABLE public.connected_tenants ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only manage their own connections
CREATE POLICY "Users can view their own connections"
  ON public.connected_tenants
  FOR SELECT
  USING (auth.uid() = user_uuid);

CREATE POLICY "Users can insert their own connections"
  ON public.connected_tenants
  FOR INSERT
  WITH CHECK (auth.uid() = user_uuid);

CREATE POLICY "Users can update their own connections"
  ON public.connected_tenants
  FOR UPDATE
  USING (auth.uid() = user_uuid);

CREATE POLICY "Users can delete their own connections"
  ON public.connected_tenants
  FOR DELETE
  USING (auth.uid() = user_uuid);

-- Super Admins can view all connections
CREATE POLICY "Super admins can view all connections"
  ON public.connected_tenants
  FOR SELECT
  USING (is_super_admin());

-- Create index for faster lookups
CREATE INDEX idx_connected_tenants_user_uuid ON public.connected_tenants(user_uuid);
CREATE INDEX idx_connected_tenants_tenant_id ON public.connected_tenants(tenant_id);

-- Add trigger to update updated_at
CREATE TRIGGER update_connected_tenants_updated_at
  BEFORE UPDATE ON public.connected_tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();