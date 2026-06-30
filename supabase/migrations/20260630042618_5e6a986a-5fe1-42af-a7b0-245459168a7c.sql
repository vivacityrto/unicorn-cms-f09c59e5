-- Broadcast attachments are intentionally one-file-to-many-tenants.
-- The existing 'msg_attach_read_tenant_member' policy derives tenant from path segment 1,
-- which breaks for files at 'broadcast/{campaign_id}/...'. Add a membership-based read policy.

CREATE POLICY "msg_attach_read_broadcast_via_membership"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND split_part(name, '/', 1) = 'broadcast'
  AND EXISTS (
    SELECT 1
    FROM public.tenant_message_attachments tma
    JOIN public.tenant_messages m ON m.id = tma.message_id
    JOIN public.tenant_users tu ON tu.tenant_id = m.tenant_id
    WHERE tma.storage_path = storage.objects.name
      AND tu.user_id = auth.uid()
  )
);

CREATE POLICY "msg_attach_read_broadcast_staff"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND split_part(name, '/', 1) = 'broadcast'
  AND public.is_vivacity_team_safe(auth.uid())
);
