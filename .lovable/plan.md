

## Fix: Prevent Notes from Disappearing During Editing

### Problem
When writing a note for an extended period, the note dialog closes unexpectedly and content is lost. This is caused by:
1. **Supabase auth token refresh** — fires `onAuthStateChange` every ~60 minutes, triggering re-renders that can reset dialog state
2. **No draft persistence** — all note content lives in React state only; any unmount or re-render cascade wipes it
3. **Parent re-renders** — profile/membership refetches on auth events can cascade and reset `isAddDialogOpen`

### Solution: localStorage Draft Auto-Save

**File: `src/components/notes/NoteFormDialog.tsx`**

1. **Auto-save draft to localStorage** — every 3 seconds while the dialog is open, persist the current form state (title, content, noteType, priority, etc.) to `localStorage` keyed by `note-draft-{tenantId}-{noteId || 'new'}`

2. **Restore draft on open** — when the dialog opens in create mode, check for an existing draft and restore it. Show a small banner: "Draft restored from [timestamp]" with a "Discard draft" link

3. **Clear draft on successful save** — after `onSave` completes successfully, remove the draft from localStorage

4. **Clear draft on explicit cancel** — when user clicks Cancel, prompt "You have unsaved changes. Discard?" before clearing

**File: `src/components/client/ClientStructuredNotesTab.tsx`** (and `ClientNotesTab.tsx`)

5. **Stabilize dialog open state** — wrap `isAddDialogOpen` with a `useRef` guard so auth-triggered re-renders don't reset it. Use `useCallback` with stable references for the `onOpenChange` handler

### Technical Details

- Draft key format: `note-draft-{tenantId}-{noteId || 'new'}`
- Auto-save interval: 3 seconds via `useEffect` + `setInterval`
- Stored fields: title, content, noteType, priority, status, duration, isPinned, assignees, packageInstanceId, startedDate/Time, completedDate/Time
- File attachments are NOT stored (too large for localStorage) — only metadata of existing files
- Draft banner uses a dismissible `Alert` component at the top of the dialog
- Max draft age: 24 hours (auto-discard older drafts on open)

### Changes Summary
| File | Change |
|------|--------|
| `src/components/notes/NoteFormDialog.tsx` | Add draft auto-save/restore logic, draft restored banner, discard confirmation |
| `src/components/client/ClientStructuredNotesTab.tsx` | Stabilize dialog state against re-renders |
| `src/components/client/ClientNotesTab.tsx` | Same stabilization |

