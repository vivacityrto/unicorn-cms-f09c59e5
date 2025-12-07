-- Create storage bucket for package documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'package-documents',
  'package-documents',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png', 'image/gif', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for package-documents bucket
CREATE POLICY "Authenticated users can upload package documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'package-documents');

CREATE POLICY "Authenticated users can read package documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'package-documents');

CREATE POLICY "Authenticated users can update package documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'package-documents');

CREATE POLICY "Authenticated users can delete package documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'package-documents');