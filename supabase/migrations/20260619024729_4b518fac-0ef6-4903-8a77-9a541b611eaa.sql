
DROP POLICY IF EXISTS "msg_attach_read_tenant_member" ON storage.objects;
CREATE POLICY "msg_attach_read_tenant_member"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND split_part(storage.objects.name, '/', 1) = tu.tenant_id::text
  )
);

DROP POLICY IF EXISTS "msg_attach_insert_tenant_member" ON storage.objects;
CREATE POLICY "msg_attach_insert_tenant_member"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND split_part(storage.objects.name, '/', 1) = tu.tenant_id::text
  )
);

DROP POLICY IF EXISTS "msg_attach_delete_tenant_member" ON storage.objects;
CREATE POLICY "msg_attach_delete_tenant_member"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND split_part(storage.objects.name, '/', 1) = tu.tenant_id::text
  )
);
