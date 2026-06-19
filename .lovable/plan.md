# Plan — Attachments in Team Communications

## Step 1 — Storage bucket + RLS

Create private bucket `message-attachments` via `supabase--storage_create_bucket` (public=false).

Then a migration adds storage.objects policies scoped to that bucket. Path layout is `{tenantId}/{conversationId}/{messageId}/{filename}`. Tenant membership is read from `public.tenant_users` (existing source of truth).

```sql
-- READ: any authenticated user that belongs to the tenant prefix
CREATE POLICY "msg_attach_read_tenant_member"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.user_uuid = auth.uid()
      AND split_part(storage.objects.name, '/', 1) = tu.tenant_id::text
  )
);

-- WRITE: same rule for INSERT (upload) and DELETE (cleanup)
CREATE POLICY "msg_attach_write_tenant_member"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK ( … same predicate … );

CREATE POLICY "msg_attach_delete_tenant_member"
ON storage.objects FOR DELETE TO authenticated
USING ( … same predicate … );
```

SuperAdmins inherit access via existing tenant membership / `service_role`.

## Step 2 — `src/lib/messageAttachments.ts`

New shared utility, used by both pages.

- Constants
  - `ALLOWED_MIME` — image/jpeg, image/png, image/gif, image/webp, application/pdf, application/msword, …wordprocessingml.document, application/vnd.ms-excel, …spreadsheetml.sheet
  - `ALLOWED_EXT` — jpg, jpeg, png, gif, webp, pdf, doc, docx, xls, xlsx
  - `MAX_BYTES = 10 * 1024 * 1024`, `MAX_FILES_PER_MESSAGE = 5`
- `sanitiseFilename(name)` — strip path separators, collapse to `[A-Za-z0-9._-]`, cap length.
- `validateAttachment(file)` — checks size, MIME, extension; throws `Error` with a user-friendly message on failure.
- `uploadMessageAttachment(supabase, file, tenantId, conversationId, messageId)`
  1. `validateAttachment(file)`
  2. `path = ${tenantId}/${conversationId}/${messageId}/${sanitiseFilename(file.name)}`
  3. `supabase.storage.from('message-attachments').upload(path, file, { contentType: file.type, upsert: false })`
  4. Insert into `tenant_message_attachments` with `{ message_id, storage_path: path, filename: file.name, mime_type: file.type, file_size: file.size }`, `.select().single()`, return the row.
- `getAttachmentUrl(supabase, storagePath)` → `createSignedUrl(storagePath, 60*60*24*7)`; return `data.signedUrl` (throw on error).
- `isImageMime`, `isPdfMime`, `isOfficeMime` helper predicates for the renderers.

## Step 3 — Composer changes (both pages)

Files: `src/pages/TeamCommunicationsPage.tsx` and `src/pages/ClientInboxPage.tsx`.

State additions:
```ts
const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
const fileInputRef = useRef<HTMLInputElement>(null);
```

UI above the textarea: when `queuedFiles.length > 0`, render chip row — each chip shows filename + `(formatBytes(size))` and a red `X` button that removes that file.

Send row: add a `Paperclip` icon `Button variant="ghost" size="icon"` next to the existing Send button, which clicks the hidden input:
```html
<input ref={fileInputRef} type="file" multiple hidden
  accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx"
  onChange={onFilesPicked} />
```

`onFilesPicked` validates each file with `validateAttachment`, toast.error on rejects, and enforces `MAX_FILES_PER_MESSAGE` against `queuedFiles.length + accepted.length`.

`handleSend` (or the `sendMessage` mutation) is updated so that after the message insert succeeds and we have `newMessage.id`, we loop `queuedFiles` calling `uploadMessageAttachment(...)` with `try/catch` per file. Any failure → `toast.warning("Attachment ‘x’ failed to upload: …")` but does not throw. Then clear `setQueuedFiles([])` and reset `fileInputRef.current.value`.

Both files already `import { supabase }` and use `toast`; only the existing insert path is augmented to return the new id (already returned from `.insert(...).select().single()` in the staff page; mirror for the client page).

## Step 4 — Display (both pages)

After messages load for a conversation:

```ts
const { data: attRows } = await supabase
  .from('tenant_message_attachments')
  .select('*')
  .in('message_id', messageIds);
```

Group by `message_id` into `Record<string, Attachment[]>` stored alongside the message list (either a sibling map state or merged onto each message object).

For images: as soon as the attachment list resolves, fire `getAttachmentUrl` in parallel for every `image/*` row and cache `{ storagePath -> signedUrl }`. Render below the message body as `<img src={signedUrl} className="max-w-[200px] rounded-md cursor-pointer" onClick={() => window.open(signedUrl, '_blank')} />`. Placeholder skeleton until the URL resolves.

For PDFs: pill button (file icon + filename + external-link icon). `onClick` → `const url = await getAttachmentUrl(...)`; `window.open(url, '_blank')`.

For Word/Excel: pill button (file icon + filename + download icon). `onClick` → fetch signed URL lazily, then trigger download via a temporary `<a href={url} download={filename}>` anchor click.

Attachments render in a `flex flex-wrap gap-2 mt-2` block under the message bubble, inside the existing message map in each page.

## Files

- New: `supabase/migrations/<ts>_message_attachments_storage_policies.sql`
- New: `src/lib/messageAttachments.ts`
- Edit: `src/pages/TeamCommunicationsPage.tsx`
- Edit: `src/pages/ClientInboxPage.tsx`

## Out of scope

- No changes to `tenant_message_attachments` schema or its RLS (already in place).
- No changes to notifications/email/SharePoint.
- No edits to `useClientCommunications.ts` unless required for the client page send path returning the new message id.

## Verification

- Manual: send a message with one image + one pdf + one docx from staff to client and from client to staff; thumbnails appear inline, pdf opens in new tab, docx downloads.
- Validation: oversize file (>10 MB) or `.exe` shows toast and is not queued; 6th file rejected.
- Tenant isolation: signed URL for tenant A is unreachable by a user in tenant B (Storage policy blocks the SELECT).
