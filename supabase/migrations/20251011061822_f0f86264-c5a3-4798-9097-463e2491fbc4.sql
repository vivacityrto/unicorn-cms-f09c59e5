-- Allow Super Admins to upload avatars for any user
CREATE POLICY "Super Admins can upload any avatar"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  public.is_super_admin()
);

-- Allow Super Admins to update any avatar
CREATE POLICY "Super Admins can update any avatar"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  public.is_super_admin()
)
WITH CHECK (
  bucket_id = 'avatars' AND
  public.is_super_admin()
);

-- Allow Super Admins to delete any avatar
CREATE POLICY "Super Admins can delete any avatar"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  public.is_super_admin()
);