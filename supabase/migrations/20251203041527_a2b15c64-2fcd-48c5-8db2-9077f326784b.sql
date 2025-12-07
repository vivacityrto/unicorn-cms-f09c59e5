-- Create the tenant-note-files storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-note-files', 'tenant-note-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload tenant note files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'tenant-note-files');

-- Allow authenticated users to view files
CREATE POLICY "Authenticated users can view tenant note files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'tenant-note-files');

-- Allow authenticated users to update their files
CREATE POLICY "Authenticated users can update tenant note files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'tenant-note-files');

-- Allow authenticated users to delete files
CREATE POLICY "Authenticated users can delete tenant note files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'tenant-note-files');