## Add paste-to-attach + composer UX polish

Apply identical changes to the main message composers in `src/pages/TeamCommunicationsPage.tsx` and `src/pages/ClientInboxPage.tsx`.

### 1. Paste-to-attach
- Add `onPaste` handler to the composer `<Textarea>`.
- Iterate `e.clipboardData.items`; for any `item.type.startsWith('image/')`, call `item.getAsFile()`, run through `validateAttachment`, and append to `queuedFiles` (respect `MAX_FILES_PER_MESSAGE`). Call `e.preventDefault()` only when at least one image was handled.
- If validation throws, show `toast.error(err.message)`.
- If clipboard has only text, do nothing — default paste runs.

### 2. Auto-resize textarea
- Switch the composer textarea to `rows={1}` with classes `resize-none overflow-y-auto`.
- Add a `ref` + `useLayoutEffect` keyed on `composerText` that resets `height = 'auto'` then sets it to `min(scrollHeight, 6 * lineHeight)`. Line height read from computed style; cap stored as constant.

### 3. Placeholder hint
- Directly below the composer row, render a small muted line (`text-xs text-muted-foreground mt-1`) reading **"Tip: paste a screenshot directly into the message box"**, shown only when `composerText.length === 0 && queuedFiles.length === 0`.

### 4. Enter / Shift+Enter
- Confirm existing `handleKeyDown` on both pages already sends on Enter and allows Shift+Enter newline. No change unless missing.

### Scope
- Only the main inline composers (TeamCommunicationsPage line ~624, ClientInboxPage line ~475). The `NewConversationDialog`-style textarea at TeamCommunicationsPage:862 is out of scope.
- No changes to `messageAttachments.ts`, edge functions, or other files.