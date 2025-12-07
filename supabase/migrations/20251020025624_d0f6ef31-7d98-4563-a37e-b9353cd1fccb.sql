-- Create client_packages junction table to link clients with packages
CREATE TABLE IF NOT EXISTS public.client_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  package_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, package_id)
);

-- Enable RLS
ALTER TABLE public.client_packages ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Super Admins can manage all client packages"
  ON public.client_packages
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can view their tenant client packages"
  ON public.client_packages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients_legacy cl
      WHERE cl.id = client_packages.client_id
        AND cl.tenant_id = get_current_user_tenant()
    )
    OR is_super_admin()
  );

-- Create index for better performance
CREATE INDEX idx_client_packages_client_id ON public.client_packages(client_id);
CREATE INDEX idx_client_packages_package_id ON public.client_packages(package_id);

-- Add trigger for updated_at
CREATE TRIGGER update_client_packages_updated_at
  BEFORE UPDATE ON public.client_packages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();