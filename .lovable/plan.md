# Server-side signed URLs for message attachments

Mirror the `upload-message-attachment` pattern so signed URL generation runs server-side with auth + tenant authorisation.

## 1. New edge function `supabase/functions/get-message-attachment-url/index.ts`

- `POST` with JSON `{ storage_path: string }`
- Inline `corsHeaders` (same shape as `upload-message-attachment`); handle `OPTIONS` preflight
- Auth: read `Authorization: Bearer <token>`; `supabaseAdmin.auth.getUser(token)` → 401 if missing/invalid
- Validate `storage_path` is a non-empty string
- Authorisation: take `tenantSegment = storage_path.split('/')[0]`, parse to number; allow if EITHER
  - `public.users` row with `user_uuid = uid`, `is_vivacity_internal = true`, `archived = false`, OR
  - `public.tenant_users` row with `user_id = uid` AND `tenant_id = Number(tenantSegment)`
  - else 403
- Service-role client: `supabase.storage.from('message-attachments').createSignedUrl(storage_path, 60 * 60 * 24 * 7)`
- Return `{ signedUrl }` on success; `{ error: string }` with appropriate status on failure
- `verify_jwt = false` (JWT validated in code); no `config.toml` change needed

## 2. Update `src/lib/messageAttachments.ts`

- Rewrite `getAttachmentUrl(supabase, storagePath)`:
  - Call `supabase.functions.invoke('get-message-attachment-url', { body: { storage_path: storagePath } })`
  - If `error`, read server message from `error.context` JSON if available, then `throw new Error(serverMessage || error.message || 'Failed to get attachment URL')`
  - If response body contains `error`, throw it
  - Return `data.signedUrl`
- Leave `uploadMessageAttachment`, `validateAttachment`, and other exports unchanged

## Notes
- No DB or storage policy changes — service role bypasses storage RLS after auth/authz checks in the function.
- Existing callers of `getAttachmentUrl` keep the same async signature, so no UI changes required.
