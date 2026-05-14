-- Drop 8 redundant avatars bucket storage policies
DROP POLICY IF EXISTS "Avatars: own avatar list" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: super admin list" ON storage.objects;
DROP POLICY IF EXISTS "Super Admins can upload any avatar" ON storage.objects;
DROP POLICY IF EXISTS "Super Admins can update any avatar" ON storage.objects;
DROP POLICY IF EXISTS "Super Admins can delete any avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
