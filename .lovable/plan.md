## Redesign Support channel in `src/components/help-center/MessageTab.tsx`

CSC channel logic and UI remain completely untouched. All changes are scoped to the support branch.

### 1. Imports
- Add `Textarea` from `@/components/ui/textarea`.
- Add `CheckCircle2` to the lucide-react import.

### 2. State additions (in component)
```ts
const [submitted, setSubmitted] = useState(false);
const [subject, setSubject] = useState("");
```

### 3. Remove support-history loading
- In the `useEffect` at line 120, remove the `else { await loadSupportThread(); }` branch and the inner `loadSupportThread()` function (lines 141–164).
- Keep the CSC branch and the `loadingHistory` setter calls intact (CSC still needs them).
- Initialize `loadingHistory` to `false` so support doesn't show a spinner; CSC re-sets it to true on entry.

### 4. Add paste handler
```ts
const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
  const file = e.clipboardData.files[0];
  if (!file || !file.type.startsWith("image/")) return;
  e.preventDefault();
  if (file.size > MAX_ATTACHMENT_BYTES) {
    toast.error("Image must be 5 MB or smaller.");
    return;
  }
  if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
  setAttachment(file);
  setAttachmentPreview(URL.createObjectURL(file));
};
```

### 5. Rewrite `sendSupport`
- Always insert a new `help_threads` row (drop the `if (!currentThreadId)` guard).
- Include `subject` in the thread insert when non-empty (the existing `metadata` diagnostic capture stays).
- After the message inserts and `updated_at` is touched, set:
  - `setSubmitted(true)`, `setInput("")`, `setSubject("")`, `setThreadId(null)`, `clearAttachment()`.

### 6. Rewrite render — split by channel
- Keep the existing return as the CSC layout (gated by `channel === "csc"`).
- For `channel === "support"`, render a new layout:
  - Header (subtitle + fallback email) — unchanged.
  - Body wrapper (flex-1, padded, scrollable):
    - When `submitted === false`:
      - `Input` for subject (optional), placeholder `"Subject (optional)"`.
      - `Textarea rows={4}` for message, placeholder from `config.placeholder`, with `onPaste={handlePaste}`.
      - Thumbnail preview row (existing markup, conditional on `attachmentPreview`).
      - Footer row: hidden file input + Paperclip ghost Button (existing) on the left, "Send Ticket" primary Button on the right.
        - Disabled when: `loading || (!input.trim() && !attachment)`.
    - When `submitted === true`:
      - Centered confirmation block: `CheckCircle2` (h-12 w-12 text-green-500), "Ticket submitted" heading, "Our team will be in touch." subtext, outline Button "Submit another ticket" → `setSubmitted(false)`.

### Out of scope
- CSC branch (load, send, realtime, render).
- `handleFileSelect`, `clearAttachment`, `fileInputRef`, `getBrowserName`, `getOSName`, diagnostic metadata.
- All other files.
