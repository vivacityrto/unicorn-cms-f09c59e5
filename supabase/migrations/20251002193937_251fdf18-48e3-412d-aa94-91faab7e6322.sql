-- Fix the Super Admin policy to avoid infinite recursion
-- Drop the problematic policy
DROP POLICY IF EXISTS "Super Admins can read all profiles" ON public.users;

-- Create a security definer function to check if user is Super Admin
CREATE OR REPLACE FUNCTION public.is_user_super_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_uuid = user_id
    AND unicorn_role = 'Super Admin'
  )
$$;

-- Recreate the Super Admin policy using the function
CREATE POLICY "Super Admins can read all profiles"
ON public.users
FOR SELECT
TO authenticated
USING (public.is_user_super_admin(auth.uid()));