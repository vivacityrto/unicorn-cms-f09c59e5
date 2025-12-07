-- Create package-documents storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('package-documents', 'package-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to upload package documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to package documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update their package documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete their package documents" ON storage.objects;

-- Create RLS policies for package-documents bucket
CREATE POLICY "Allow authenticated users to upload package documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'package-documents');

CREATE POLICY "Allow public read access to package documents"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'package-documents');

CREATE POLICY "Allow authenticated users to update their package documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'package-documents');

CREATE POLICY "Allow authenticated users to delete their package documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'package-documents');