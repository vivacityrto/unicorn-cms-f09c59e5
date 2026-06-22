CREATE POLICY "msg_attach_write_staff"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments'
  AND public.is_vivacity_team_safe((SELECT auth.uid()))
);