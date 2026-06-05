# Support Tickets — Layout polish + staff reply attachments

Scope: `src/pages/SupportTicketsPage.tsx` only. No hooks, schema, or other pages touched.

## 1. Layout / styling fixes in `renderDetail()`

- Replace the `ScrollArea` wrapping messages with a `<div className="flex-1 overflow-y-auto p-4">` so the message list (not the whole panel) scrolls. The header stays pinned at top, compose area stays pinned at bottom.
- Add `<Separator />` (already available at `@/components/ui/separator`) between the message list and the compose area, replacing the existing `border-t` on the compose container.
- Message bubble styling:
  - Staff messages: keep `justify-end`, swap bubble class to `bg-purple-100 text-purple-900` (brand purple per Academy/secondary palette).
  - User messages: keep current `bg-muted text-foreground` left-aligned.
  - Keep existing attachment rendering (images + links) unchanged.
- Left thread list: the preview line already has `truncate`; ensure all three text rows (`user_name`, `tenant_name`, preview) are one-line `truncate`. Card heights become consistent.

## 2. Staff reply attachments

Mirror the client-side MessageTab upload contract:

- Bucket: `support-attachments` (existing)
- Path: `${tenant_id}/${thread_id}/${uuid}-${filename}`
- Stored on message via `metadata.attachments = [{ url, name, type }]` using public URL.

UI changes to compose area:
- Add `Paperclip` icon button (from `lucide-react`) to the left of the Mark as Resolved / Reopen button (i.e. start of the action row). Variant `outline`, size `sm`, icon-only.
- Hidden `<input type="file" ref={fileInputRef} accept="image/*,application/pdf" multiple className="hidden" />`. Paperclip click triggers it.
- New state: `selectedFiles: File[]`, `uploading: boolean`.
- Validate each file ≤ 5 MB, accept only images + PDFs. Reject with toast otherwise.
- Show selected files as dismissible chips above the textarea: rounded pill with filename + `×` button that removes that file from `selectedFiles`.
- Send button:
  - Enabled when `(reply.trim() || selectedFiles.length > 0) && !sending && !uploading`.
  - While uploading/sending: show spinner (`Loader2` animate-spin) instead of `Send` icon, disabled.

`handleSendReply` updates:
1. If `selectedFiles.length > 0`: upload each via `supabase.storage.from('support-attachments').upload(path, file)`, then `getPublicUrl(path)`. Collect `{ url, name: file.name, type: file.type }`.
2. Insert into `help_messages` with `metadata: { attachments }` when present; `content` may be empty if at least one attachment exists.
3. On success: clear both `reply` and `selectedFiles`, reset file input value.
4. On error during upload: toast + abort send; do not insert message.

## Technical notes

- Reuse `crypto.randomUUID()` for the filename UUID.
- `tenant_id` comes from `selected.tenant_id`; `thread_id` from `selected.id`.
- No new dependencies; `Paperclip`, `Loader2`, `X` already available via lucide-react.
- `Separator` import: `import { Separator } from "@/components/ui/separator"`.

## Out of scope

- No DB migrations, no bucket creation (already exists), no edge function changes.
- No changes to client MessageTab, hooks, or other pages.
