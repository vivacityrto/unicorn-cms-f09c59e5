-- Update the is_super_admin_member function to check for active status
CREATE OR REPLACE FUNCTION public.is_super_admin_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
    AND tm.role::text LIKE 'SUPER_ADMIN%'
    AND tm.status = 'active'
  )
$$;