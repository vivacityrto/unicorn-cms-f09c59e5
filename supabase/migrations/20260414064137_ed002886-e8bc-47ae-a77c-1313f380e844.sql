
-- Create the compliance-evidence storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('compliance-evidence', 'compliance-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload evidence files
CREATE POLICY "Authenticated users can upload compliance evidence"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'compliance-evidence');

-- Allow authenticated users to view compliance evidence
CREATE POLICY "Authenticated users can view compliance evidence"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'compliance-evidence');

-- Allow authenticated users to update their own evidence files
CREATE POLICY "Authenticated users can update compliance evidence"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'compliance-evidence');

-- Allow authenticated users to delete their own evidence files
CREATE POLICY "Authenticated users can delete compliance evidence"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'compliance-evidence');
