# Plan: Server-side message attachment uploads

Move message attachment uploads from direct client→storage to a Supabase edge function that performs auth, authorisation, validation, sanitisation, storage upload, and DB insert using the service role. This closes the gap where Vivacity staff uploads (and any other RLS edge cases) on `message-attachments` would be blocked.

## 1. New edge function `supabase/functions/upload-message-attachment/index.ts`

- Accepts `POST` with `multipart/form-data`:
  - `file` (File, required)
  - `tenant_id` (string, required — accepts numeric bigint as string)
  - `conversation_id` (string, required)
  - `message_id` (string, required)
- CORS: handle `OPTIONS` preflight; include `corsHeaders` on every response (success + error).
- Auth:
  - Read `Authorization: Bearer <token>`; 401 if missing.
  - Validate via `supabaseAdmin.auth.getUser(token)`; 401 if invalid.
- Authorisation (either passes):
  - `public.users` row where `user_uuid = uid`, `is_vivacity_internal = true`, and not archived/disabled → staff allowed.
  - OR `public.tenant_users` row where `user_id = uid` AND `tenant_id = tenant_id` → tenant member allowed.
  - Otherwise 403.
- File validation:
  - `file.size <= 10 MB` else 400.
  - `file.type` ∈ allowed MIME list (jpeg, png, gif, webp, pdf, msword, docx, ms-excel, xlsx) else 400.
- Filename sanitisation: strip path separators, collapse non-`[A-Za-z0-9._-]` to `_`, cap at 150 chars.
- Storage upload via service role client:
  - Bucket `message-attachments`, path `{tenant_id}/{conversation_id}/{message_id}/{sanitisedFilename}`, `contentType = file.type`, `upsert: false`.
- DB insert via service role client into `public.tenant_message_attachments`:
  - `{ message_id, storage_path, filename: file.name (original), mime_type: file.type, file_size: file.size }`
  - On insert failure: best-effort delete the uploaded object, return 500.
- Success: 200 with `{ storage_path, filename, mime_type, file_size }` (plus inserted row id for convenience).
- Config: function deploys with default `verify_jwt = false` (we validate the JWT in code), no `supabase/config.toml` change needed.

## 2. Update `src/lib/messageAttachments.ts`

- Keep exports: `ALLOWED_MIME`, `ALLOWED_EXT`, `MAX_BYTES`, `BUCKET`, `SIGNED_URL_TTL_SECONDS`, helpers, `sanitiseFilename`, `validateAttachment`, `getAttachmentUrl` — all unchanged.
- Rewrite `uploadMessageAttachment(supabase, file, tenantId, conversationId, messageId)`:
  1. Run `validateAttachment(file)` client-side (fast fail).
  2. Build `FormData` with `file`, `tenant_id` (stringified), `conversation_id`, `message_id`.
  3. Call `supabase.functions.invoke('upload-message-attachment', { body: formData })`.
  4. If `error`, throw `new Error(error.message)` (preferring any `error` field from the response body when available).
  5. Return the data as `MessageAttachmentRow` (function will return enough fields; we'll include `id` and `created_at` in the response for parity).

## 3. No DB / storage policy changes

- `tma_insert_staff` and `tma_insert_tenant_member` already permit DB inserts.
- Storage uploads now go through the service role, so existing RLS gap on `storage.objects` for staff is bypassed safely (auth + authz still enforced in the function).

## Technical notes

- Use `npm:@supabase/supabase-js@2` and import `corsHeaders` from `npm:@supabase/supabase-js@2/cors`.
- Service role key from `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`; URL from `SUPABASE_URL`.
- All responses JSON with CORS headers; error bodies use `{ error: string }`.
- Do not log file contents or tokens.
