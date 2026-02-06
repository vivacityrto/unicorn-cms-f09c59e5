-- Drop the overly permissive policies and replace with tenant-scoped ones
DROP POLICY IF EXISTS "Users can upload to their tenant folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their tenant files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their uploads" ON storage.objects;

-- Staff can upload files to any tenant folder
CREATE POLICY "Staff can upload portal documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'portal-documents' 
  AND auth.role() = 'authenticated'
  AND is_staff()
);

-- Staff can view all portal documents
CREATE POLICY "Staff can view portal documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'portal-documents'
  AND auth.role() = 'authenticated'
  AND is_staff()
);

-- Tenant users can upload to their own tenant folder
CREATE POLICY "Tenant users can upload to their tenant"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'portal-documents'
  AND auth.role() = 'authenticated'
  AND NOT is_staff()
  AND (storage.foldername(name))[1]::int IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  )
);

-- Tenant users can view files in their tenant folder
CREATE POLICY "Tenant users can view their tenant files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'portal-documents'
  AND auth.role() = 'authenticated'
  AND NOT is_staff()
  AND (storage.foldername(name))[1]::int IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  )
);

-- Staff can delete files
CREATE POLICY "Staff can delete portal documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'portal-documents'
  AND auth.role() = 'authenticated'
  AND is_staff()
);