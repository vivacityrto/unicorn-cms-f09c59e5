## Goal
Add a single storage policy that allows Vivacity staff to upload files to the `message-attachments` bucket.

## Why
The existing `msg_attach_insert_tenant_member` policy only permits uploads by users who are members of the tenant (via `tenant_users`). Vivacity internal staff are not in `tenant_users` for client tenants, so their uploads are currently blocked at the storage level. The `tenant_message_attachments` table already has a staff insert policy (`tma_insert_staff`); this change closes the corresponding storage-object gap.

## Plan
Create a new migration with exactly one policy statement:

```sql
CREATE POLICY "msg_attach_write_staff"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments'
  AND public.is_vivacity_team_safe((SELECT auth.uid()))
);
```

## Verification
- `public.is_vivacity_team_safe` exists and checks `users.is_vivacity_internal = true` with archived/disabled guards.
- The `message-attachments` bucket exists.
- No other changes are needed — this is strictly the missing storage-layer counterpart to the existing `tma_insert_staff` table policy.