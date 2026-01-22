-- Update the security definer function to include SuperAdmin access
CREATE OR REPLACE FUNCTION public.user_has_tenant_access(p_tenant_id BIGINT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users 
    WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  )
  OR EXISTS (
    SELECT 1 FROM users 
    WHERE user_uuid = auth.uid() AND global_role = 'SuperAdmin'
  )
$$;