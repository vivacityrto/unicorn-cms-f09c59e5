

## Add Autosave Status Indicator to QC Forms

The app already autosaves every change with a 1-second debounce delay -- data is persisted to Supabase automatically as you type. The problem is there is no visual feedback confirming this.

### What to build

Add a small save-status indicator that shows the current state: **Saving...**, **Saved**, or **Error**. This will appear at the top of each section card (or globally at the top of the session page).

### Technical approach

1. **Track mutation state in `QCSectionCard.tsx`**: The `upsertAnswer` mutation from `useQuarterlyConversations()` already has `isPending`/`isError`/`isSuccess` states via React Query. Use these plus the debounce timer to derive a 3-state indicator:
   - While debounce timer is active or mutation is pending: "Saving..."
   - After mutation succeeds: "All changes saved" (with a checkmark)
   - On error: "Save failed" (with retry option)

2. **Add a subtle status badge** near the section header showing the state with appropriate icons (Loader2 spinning for saving, Check for saved, AlertCircle for error).

3. **Apply the same pattern to `GWCPanel.tsx`** which also saves data independently via `qc_set_fit`.

4. **Optional global indicator**: Add a small persistent "All changes saved" text at the top of the `EosQCSession` page that aggregates status across all sections.

### Files to edit
- `src/components/eos/qc/QCSectionCard.tsx` -- add per-section save indicator
- `src/components/eos/qc/GWCPanel.tsx` -- add save indicator for GWC
- Optionally `src/pages/EosQCSession.tsx` -- add a global autosave status bar

