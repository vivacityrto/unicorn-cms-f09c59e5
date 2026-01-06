-- Create helper function to check if current user is SuperAdmin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND global_role = 'SuperAdmin'
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- Drop existing avatar storage policies to recreate them
DROP POLICY IF EXISTS "Avatar upload for own user" ON storage.objects;
DROP POLICY IF EXISTS "Avatar update for own user" ON storage.objects;
DROP POLICY IF EXISTS "Avatar delete for own user" ON storage.objects;
DROP POLICY IF EXISTS "Avatar read for authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "SuperAdmin can upload any avatar" ON storage.objects;
DROP POLICY IF EXISTS "SuperAdmin can update any avatar" ON storage.objects;
DROP POLICY IF EXISTS "SuperAdmin can delete any avatar" ON storage.objects;

-- Create new comprehensive avatar storage policies

-- INSERT: User can upload their own avatar OR SuperAdmin can upload any avatar
CREATE POLICY "Avatar insert policy"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND (
    -- Self upload: path starts with user's own ID
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    -- SuperAdmin can upload for anyone
    public.is_super_admin()
  )
);

-- UPDATE: User can update their own avatar OR SuperAdmin can update any avatar  
CREATE POLICY "Avatar update policy"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    public.is_super_admin()
  )
)
WITH CHECK (
  bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    public.is_super_admin()
  )
);

-- DELETE: User can delete their own avatar OR SuperAdmin can delete any avatar
CREATE POLICY "Avatar delete policy"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    public.is_super_admin()
  )
);

-- SELECT: Avatars are publicly readable (for display)
CREATE POLICY "Avatar select policy"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

-- Update RLS on users table to allow SuperAdmin to update any user's avatar_url
DROP POLICY IF EXISTS "SuperAdmin can update any user avatar" ON public.users;
CREATE POLICY "SuperAdmin can update any user avatar"
ON public.users FOR UPDATE
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());