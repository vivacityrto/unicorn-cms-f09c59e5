-- Add package_ids array column to support multiple packages per tenant
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS package_ids bigint[] DEFAULT '{}';

-- Migrate existing package_id data to package_ids array
UPDATE public.tenants 
SET package_ids = ARRAY[package_id] 
WHERE package_id IS NOT NULL AND (package_ids IS NULL OR package_ids = '{}');

-- Create index for efficient array queries
CREATE INDEX IF NOT EXISTS idx_tenants_package_ids ON public.tenants USING GIN (package_ids);

-- Create a helper function to check if tenant has a specific package
CREATE OR REPLACE FUNCTION public.tenant_has_package(p_tenant_id bigint, p_package_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_package_id = ANY(package_ids) 
  FROM public.tenants 
  WHERE id = p_tenant_id;
$$;

-- Create a helper function to add a package to a tenant
CREATE OR REPLACE FUNCTION public.add_package_to_tenant(p_tenant_id bigint, p_package_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.tenants 
  SET 
    package_ids = CASE 
      WHEN package_ids IS NULL THEN ARRAY[p_package_id]
      WHEN p_package_id = ANY(package_ids) THEN package_ids
      ELSE array_append(package_ids, p_package_id)
    END,
    package_id = p_package_id,  -- Keep package_id updated to latest added package
    package_added_at = now(),
    updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;