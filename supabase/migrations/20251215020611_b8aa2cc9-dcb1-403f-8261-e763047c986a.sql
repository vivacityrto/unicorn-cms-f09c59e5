-- Create the document-files storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('document-files', 'document-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to the bucket
CREATE POLICY "Public read access for document-files"
ON storage.objects FOR SELECT
USING (bucket_id = 'document-files');

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload to document-files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'document-files' AND auth.role() = 'authenticated');

-- Allow authenticated users to update their files
CREATE POLICY "Authenticated users can update document-files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'document-files' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete files
CREATE POLICY "Authenticated users can delete from document-files"
ON storage.objects FOR DELETE
USING (bucket_id = 'document-files' AND auth.role() = 'authenticated');