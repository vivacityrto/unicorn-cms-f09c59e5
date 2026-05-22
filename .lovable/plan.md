## CSC-006 Fix: Pre-fill note "Started" date from time entry

### Problem
`AddTimeDialog` → note creation flow navigates to `/tenant/:id/notes?initNote=true&...` but omits the time entry's date. `TenantNotes` therefore leaves `startedDate` undefined, the note is saved with `started_date = NULL`, and the list shows "Not started".

### Changes

**1. `src/components/client/AddTimeDialog.tsx` (line ~339, `handleNotePromptYes`)**

Extend the URL params with the form's existing `date` state (already an ISO `YYYY-MM-DD` string from `setDate(new Date().toISOString().split('T')[0])`):

```ts
const params = new URLSearchParams({
  initNote: 'true',
  noteTitle: title,
  timeEntryId: savedEntryId!,
  ...(noteBody ? { noteDetails: noteBody } : {}),
  ...(workType ? { workType } : {}),
  ...(selectedInstanceId ? { packageId: selectedInstanceId.toString() } : {}),
  ...(date ? { startedDate: date } : {}),   // NEW — only include when present
});
```

If `date` is empty/falsy (shouldn't normally happen, but the form allows clearing), the param is omitted and the note dialog opens with no pre-filled date — matching today's behaviour for that edge case.

**2. `src/pages/TenantNotes.tsx` (useEffect at line 102)**

Read and apply the new param, then include it in the cleanup:

```ts
const urlStartedDate = searchParams.get('startedDate');
...
if (initNote === 'true') {
  setNoteTitle(urlNoteTitle || '');
  if (urlNoteDetails) setNoteText(urlNoteDetails);
  if (urlTimeEntryId) setPendingTimeEntryId(urlTimeEntryId);
  if (urlPkgInstanceId) setPendingPackageInstanceId(parseInt(urlPkgInstanceId));
  if (urlStartedDate) {
    // Parse YYYY-MM-DD as a local date (avoid UTC drift from `new Date('YYYY-MM-DD')`)
    const [y, m, d] = urlStartedDate.split('-').map(Number);
    if (y && m && d) setStartedDate(new Date(y, m - 1, d));
  }
  setIsAddDialogOpen(true);

  const newParams = new URLSearchParams(searchParams);
  newParams.delete('initNote');
  newParams.delete('noteTitle');
  newParams.delete('timeEntryId');
  newParams.delete('noteDetails');
  newParams.delete('packageInstanceId');
  newParams.delete('startedDate');   // NEW
  navigate(...);
}
```

Local-date parsing avoids the classic `new Date("2026-05-22")` UTC-midnight bug that can show the previous day in AU timezones — important since the "Started" column displays a date.

`startedTime` is left at its default (`12:00 PM`), matching existing manual note behaviour; the save path at line 299 already composes `started_date` from `startedDate` + `startedTime`, so the column will populate correctly.

### Deep-dive findings (informational — not in scope to fix here)

- **Pre-existing param mismatch**: `AddTimeDialog` emits `packageId`, but `TenantNotes` reads `packageInstanceId`. Result: package pre-selection from this flow has never worked. Out of scope for CSC-006; flagging for a separate ticket.
- **39 historical notes** with `timeentry_id` and `started_date = NULL`: forward-only fix, as specified. A backfill could later set `started_date = time_entries.entry_date` if desired.
- `EditTimeDialog.tsx`, `useNotes.tsx`, RLS, triggers, schema — untouched.
- Three callers (`TenantTimeTrackerBar`, `PackageTimeSection`, `ClientTimeWidget`) all go through the same `handleNotePromptYes` path — fix benefits all of them uniformly.
- Audit trail: `notes.started_date` is the only field affected; `created_at`/`updated_at` triggers continue to fire normally. No audit gap introduced.

### Risk assessment

| Area | Risk | Mitigation |
|---|---|---|
| Existing pre-fills (title/details/timeEntryId/pkg) | None | Logic untouched; new param is additive |
| Other callers of `AddTimeDialog` | None | Single shared code path |
| Note dialog opened from other entry points (no URL param) | None | New code is conditional on `urlStartedDate` |
| Timezone drift on date display | Mitigated | Local-date constructor avoids UTC parsing |
| RLS / createNote / DB schema | None | No changes |
| Edit flow for existing notes | None | `EditNoteDialog` unaffected |

### Summary
Two surgical, additive edits — one URL param producer, one consumer — restore the missing "Started" date on notes created from a time entry, with no schema, RLS, hook, or automation changes.