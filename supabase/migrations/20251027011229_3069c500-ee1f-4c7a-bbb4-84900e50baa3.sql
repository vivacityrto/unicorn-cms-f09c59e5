-- Create helper function to check if user is Team Leader or Super Admin
CREATE OR REPLACE FUNCTION public.is_admin_or_team_leader()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN get_current_user_role() IN ('Super Admin', 'SuperAdmin', 'Team Leader');
END;
$$;

-- Update documents SELECT policy to allow Team Leaders
DROP POLICY IF EXISTS "documents_select" ON public.documents;
CREATE POLICY "documents_select" 
ON public.documents 
FOR SELECT 
TO public
USING (
  (get_current_user_tenant() = tenant_id) 
  OR is_super_admin() 
  OR get_current_user_role() = 'Team Leader'
);

-- Update user_invitations SELECT policy to allow Team Leaders
DROP POLICY IF EXISTS "Super Admins can view all invitations" ON public.user_invitations;
CREATE POLICY "Admins and Team Leaders can view all invitations" 
ON public.user_invitations 
FOR SELECT 
TO authenticated
USING (
  is_super_admin() 
  OR get_current_user_role() = 'Team Leader'
);