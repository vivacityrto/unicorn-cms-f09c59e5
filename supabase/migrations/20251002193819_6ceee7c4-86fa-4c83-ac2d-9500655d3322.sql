-- Add RLS policies for users table to allow profile fetching

-- Policy for users to read their own profile
CREATE POLICY "Users can read their own profile"
ON public.users
FOR SELECT
TO authenticated
USING (auth.uid() = user_uuid);

-- Policy for Super Admins to read all user profiles
CREATE POLICY "Super Admins can read all profiles"
ON public.users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = auth.uid()
    AND unicorn_role = 'Super Admin'
  )
);