-- Add leave/away fields to users table for team profile feature parity
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS leave_from date,
ADD COLUMN IF NOT EXISTS leave_until date,
ADD COLUMN IF NOT EXISTS cover_user_id uuid REFERENCES public.users(user_uuid) ON DELETE SET NULL;

-- Create index for cover user lookups
CREATE INDEX IF NOT EXISTS idx_users_cover_user_id ON public.users(cover_user_id);

-- Create is_super_admin_admin() function to check if user is SuperAdmin Administrator level
CREATE OR REPLACE FUNCTION public.is_super_admin_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND global_role = 'SuperAdmin'
    AND superadmin_level = 'Administrator'
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.is_super_admin_admin() TO authenticated;

-- Update avatar storage policies to allow SuperAdmin-Administrator to upload for any user
-- First drop existing policies that need updating
DROP POLICY IF EXISTS "Avatar insert policy" ON storage.objects;
DROP POLICY IF EXISTS "Avatar update policy" ON storage.objects;
DROP POLICY IF EXISTS "Avatar delete policy" ON storage.objects;

-- Create new policies with Administrator-level check
CREATE POLICY "Avatar insert policy" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text  -- Own avatar
    OR public.is_super_admin_admin()  -- Administrator can upload for anyone
  )
);

CREATE POLICY "Avatar update policy" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_super_admin_admin()
  )
)
WITH CHECK (
  bucket_id = 'avatars' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_super_admin_admin()
  )
);

CREATE POLICY "Avatar delete policy" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_super_admin_admin()
  )
);