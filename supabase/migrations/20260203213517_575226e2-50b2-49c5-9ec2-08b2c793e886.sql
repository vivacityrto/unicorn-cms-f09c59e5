-- Create a no-arg version of is_vivacity_team that uses auth.uid()
CREATE OR REPLACE FUNCTION public.is_vivacity_team()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
    AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  );
$$;