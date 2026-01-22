-- Create RLS policies for tenant_addresses table
-- SuperAdmins and users with access to the tenant can view addresses

-- Policy for viewing addresses
CREATE POLICY "Users can view addresses for their accessible tenants"
ON public.tenant_addresses
FOR SELECT
USING (
  -- SuperAdmins can see all addresses
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role = 'Super Admin'
  )
  OR
  -- Users connected to this tenant can see its addresses
  EXISTS (
    SELECT 1 FROM public.connected_tenants ct 
    WHERE ct.user_uuid = auth.uid() 
    AND ct.tenant_id = tenant_addresses.tenant_id
  )
);

-- Policy for inserting addresses
CREATE POLICY "Users can insert addresses for their accessible tenants"
ON public.tenant_addresses
FOR INSERT
WITH CHECK (
  -- SuperAdmins can insert addresses
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role = 'Super Admin'
  )
  OR
  -- Users connected to this tenant can insert addresses
  EXISTS (
    SELECT 1 FROM public.connected_tenants ct 
    WHERE ct.user_uuid = auth.uid() 
    AND ct.tenant_id = tenant_addresses.tenant_id
  )
);

-- Policy for updating addresses
CREATE POLICY "Users can update addresses for their accessible tenants"
ON public.tenant_addresses
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role = 'Super Admin'
  )
  OR
  EXISTS (
    SELECT 1 FROM public.connected_tenants ct 
    WHERE ct.user_uuid = auth.uid() 
    AND ct.tenant_id = tenant_addresses.tenant_id
  )
);

-- Policy for deleting addresses
CREATE POLICY "Users can delete addresses for their accessible tenants"
ON public.tenant_addresses
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role = 'Super Admin'
  )
  OR
  EXISTS (
    SELECT 1 FROM public.connected_tenants ct 
    WHERE ct.user_uuid = auth.uid() 
    AND ct.tenant_id = tenant_addresses.tenant_id
  )
);

-- Create a partial unique index to enforce only one HO and one PO address per tenant
-- This allows multiple DS (Delivery Site) and OT (Other) addresses
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_addresses_unique_ho
ON public.tenant_addresses (tenant_id, address_type)
WHERE address_type = 'HO' AND (inactive IS NULL OR inactive = false);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_addresses_unique_po
ON public.tenant_addresses (tenant_id, address_type)
WHERE address_type = 'PO' AND (inactive IS NULL OR inactive = false);