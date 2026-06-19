## Client portal attachments — fill remaining gap

Most of this work is already wired:

- `useClientCommunications.sendMessage` already does `.insert(...).select("id").single()` and returns `{ messageId, tenantId }` — no change needed.
- `MessagesTab` in `ClientInboxPage.tsx` already has `queuedFiles` state, `fileInputRef`, `handleFilesPicked`, `removeQueued`, a `Paperclip` button + hidden input in the composer, attachment chip rendering via `AttachmentChips`, and per-file `uploadMessageAttachment` after `sendMessage.mutateAsync`. The message list also renders `<MessageAttachments />` (which handles image thumbnails, PDF pills, Office download pills, and signed-URL fetching) under each message body.

Only one gap remains: `NewConversationDialog` cannot attach files to the first message.

### Update `src/components/client/NewConversationDialog.tsx`
- Import `useRef`, `Paperclip` and `X` from lucide-react, `toast` from sonner, `supabase` client, and `validateAttachment`, `uploadMessageAttachment`, `MAX_FILES_PER_MESSAGE`, `formatBytes` from `@/lib/messageAttachments`.
- Add `queuedFiles: File[]` state and `fileInputRef`.
- Add `onFilesPicked` mirroring `MessagesTab`: validate each file via `validateAttachment`, `toast.error` on rejects, respect `MAX_FILES_PER_MESSAGE` against current queue + accepted, append accepted to `queuedFiles`, then clear the input value.
- Add a `removeQueued(idx)` helper.
- Change the dialog API so it can do the upload itself:
  - Update `NewConversationDialogProps.onSubmit` to **return the new conversation id** (`Promise<string>`).
  - Update `MessagesTab.handleNewConversation` in `ClientInboxPage.tsx` to `return newId` so the dialog receives it.
- In `handleSubmit`:
  - Call `await onSubmit(...)` → `conversationId`.
  - If `queuedFiles.length > 0` and we have a `conversationId` and a tenant, query `tenant_messages` filtered by `conversation_id` ordered `created_at asc` limit 1 to get the first message id.
  - Loop `queuedFiles` calling `uploadMessageAttachment(supabase, file, tenantId, conversationId, firstMsg.id)` in per-file try/catch — `toast.warning` on failure, never throw.
  - Get `tenantId` by accepting it as a new optional prop from the page (which already has `activeTenantId` via `useClientTenant`), or by reading it from the conversation row in the same lookup.
  - Clear `queuedFiles`, reset `fileInputRef.current.value`, alongside the existing field resets.
- Render queued file chips (filename + `formatBytes(size)` + red X remove) in a `flex flex-wrap gap-2` row inside `AppModalBody` below the Message textarea.
- In `AppModalFooter`, add a `Button variant="ghost" size="icon" type="button"` with the `Paperclip` icon (clicks the hidden input) and a hidden `<input ref={fileInputRef} type="file" multiple hidden accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx" onChange={onFilesPicked} />` before Cancel/Send.

### Scope
No DB/schema changes. No changes to the hook or the existing `MessagesTab` composer/render — they already satisfy steps 1–3 of the request.
