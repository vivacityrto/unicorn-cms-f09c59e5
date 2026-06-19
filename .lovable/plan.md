## NewTeamMessageDialog: layout polish + attachment support

Update `NewTeamMessageDialog` in `src/pages/TeamCommunicationsPage.tsx` (lines 586–733).

### Layout changes
- `AppModalContent` size `md` → `lg`.
- `AppModalBody` `space-y-4` → `space-y-5`.
- Keep **Client** as full-width row.
- New `grid grid-cols-2 gap-4` row with **Subject** (label "Subject", placeholder keeps the "What is this about?" hint) and **Category** side by side.
- **Message** full-width row, `rows={5}`.
- Helper `<p className="text-xs text-muted-foreground mt-1">Your client will be notified when this message is sent.</p>` under the textarea.

### Attachments
- Add imports: `useRef`, `Paperclip` (lucide), and from `@/lib/messageAttachments`: `validateAttachment`, `uploadMessageAttachment`, `MAX_FILES_PER_MESSAGE`, `formatBytes`.
- New state: `queuedFiles: File[]` and `fileInputRef`.
- `onFilesPicked`: validate each file, respect `MAX_FILES_PER_MESSAGE` vs current queue + accepted, `toast.error` on rejects, append accepted to `queuedFiles`.
- Chip row (only when `queuedFiles.length > 0`) above `AppModalFooter`: `flex flex-wrap gap-2 mt-2`, each chip shows `filename (formatBytes(size))` + red X remove button.
- `handleSubmit`:
  - Change message insert to `.insert({...}).select("id").single()` → `newMsg.id`.
  - Loop `queuedFiles`, call `uploadMessageAttachment(supabase, file, tid, conv.id, newMsg.id)` in per-file try/catch; on failure `toast.warning(\`Attachment '${file.name}' failed to upload\`)`.
  - On success cleanup: `setQueuedFiles([])` and `fileInputRef.current.value = ""` alongside existing resets.
- `AppModalFooter`: prepend a `Button variant="ghost" size="icon" type="button"` with `Paperclip` icon that clicks the hidden input. Add hidden `<input ref={fileInputRef} type="file" multiple hidden accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx" onChange={onFilesPicked} />`.

### Scope
- No other components or pages touched. No schema or business-logic changes — purely UI + wiring into the existing attachment utility.
