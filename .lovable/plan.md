## Fix Note + Time Entry save flow (2 bugs)

### File 1 — `src/components/notes/NoteFormDialog.tsx`

**Fix 1 — Required duration validation**

In `handleSave`:
- Add `const [durationError, setDurationError] = useState(false);` with other state.
- Before `if (!content.trim() || saving) return;`, add validation: when `logTime` is true and `duration` is empty/NaN/<=0, show a destructive toast ("Duration required") and `setDurationError(true)` then return.
- Clear `durationError` in the duration input's `onChange`.
- Apply `className={durationError ? 'border-destructive' : ''}` to the duration `Input`.

### File 2 — `src/components/client/ClientStructuredNotesTab.tsx`

**Fix 2 — Use `rpc_add_time_entry` instead of direct insert**

In `handleNoteFormSave`, replace the existing inline `time_entries` insert block (the `if (!selectedNote && data.logTime && ... && createdNoteId)` block) with:

- Call `supabase.rpc('rpc_add_time_entry', { p_tenant_id, p_client_id, p_duration_minutes, p_date, p_package_id: null, p_stage_id: null, p_task_id: null, p_work_type, p_notes, p_is_billable })`.
- On error: surface `rpcError.message` via destructive toast ("Note saved — time entry failed").
- On success: fetch the latest `time_entries` row for `client_id = tenantId` ordered by `created_at desc limit 1`, then:
  - `update notes.timeentry_id = latestEntry.id` for `createdNoteId`.
  - If `data.timeWorkSubType` present, update that row's `work_sub_type`.
  - Show success toast with minutes logged.
- Outer `catch` surfaces the error message in a destructive toast.

No other changes in either file.
