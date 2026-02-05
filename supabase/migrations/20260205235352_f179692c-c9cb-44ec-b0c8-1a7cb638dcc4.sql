-- Fix backup_tenant_addresses security by enabling RLS and restricting to SuperAdmin only

-- Enable Row Level Security
ALTER TABLE public.backup_tenant_addresses ENABLE ROW LEVEL SECURITY;

-- Create policy restricting all access to SuperAdmins only
CREATE POLICY "backup_tenant_addresses_superadmin_only"
ON public.backup_tenant_addresses FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());