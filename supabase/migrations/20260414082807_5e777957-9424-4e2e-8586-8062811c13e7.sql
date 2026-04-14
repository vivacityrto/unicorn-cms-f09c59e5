
INSERT INTO storage.buckets (id, name, public)
VALUES ('audit-documents', 'audit-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload audit documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'audit-documents');

CREATE POLICY "Authenticated users can view audit documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'audit-documents');

CREATE POLICY "Authenticated users can delete audit documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'audit-documents');
