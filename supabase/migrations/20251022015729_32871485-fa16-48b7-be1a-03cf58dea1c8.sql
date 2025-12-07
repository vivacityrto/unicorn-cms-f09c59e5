-- Grant EXECUTE permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION public.can_manage_packages() TO authenticated;

-- Ensure the users table allows authenticated users to read their own profile
-- This policy should already exist but let's make sure
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'users' 
    AND policyname = 'Users can read own record for auth'
  ) THEN
    CREATE POLICY "Users can read own record for auth"
    ON public.users
    FOR SELECT
    TO authenticated
    USING (user_uuid = auth.uid());
  END IF;
END
$$;