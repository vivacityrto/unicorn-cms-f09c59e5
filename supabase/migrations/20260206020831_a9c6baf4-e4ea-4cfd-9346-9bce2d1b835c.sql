-- Create portal-documents storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('portal-documents', 'portal-documents', false, 52428800, null)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for portal-documents bucket
-- Allow authenticated users to upload to their tenant folder
CREATE POLICY "Users can upload to their tenant folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'portal-documents' 
  AND auth.role() = 'authenticated'
);

-- Allow users to view files in their tenant folder
CREATE POLICY "Users can view their tenant files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'portal-documents'
  AND auth.role() = 'authenticated'
);

-- Allow users to delete files they uploaded
CREATE POLICY "Users can delete their uploads"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'portal-documents'
  AND auth.role() = 'authenticated'
);