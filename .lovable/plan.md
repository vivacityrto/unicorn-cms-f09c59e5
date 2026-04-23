

## Plan: fix audit data loss (notes & summaries silently dropped)

### What the database actually shows for the Davies audit

I checked `client_audit_responses`, `client_audit_sections` and `client_audit_findings` for this audit. Despite an extended editing session, only **4 question responses** are saved, **no findings**, **no section summaries**, and **no section risk levels**. So the report from the auditor is correct — most of her work never reached the database.

### Root cause — three real bugs in the autosave path

All free-text fields (auditor notes per question, section assessment summary, opening/closing meeting summaries) follow the same pattern:

```ts
const [value, setValue] = useState(initialValue);  // seeded ONCE on mount
const debounceRef = useRef<...>();
const handleChange = (v) => {
  setValue(v);
  clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => onSave(v), 500–800ms);
};
useEffect(() => () => clearTimeout(debounceRef.current), []); // CANCELS on unmount
```

This produces three independent ways to silently lose typing:

1. **Pending debounce is *cancelled*, not flushed, on unmount.** Switching phase tab (Opening → Document Review → Closing), expanding/collapsing a section card, switching the workspace tab (Form → Findings), or navigating away within ≤800 ms of the last keystroke wipes everything not yet sent. Multi-user audits make this much more frequent because react-query refetches re-render the tree.
2. **No flush on tab close / page unload.** No `beforeunload` handler. Closing the tab or refreshing during a debounce window loses the in-flight text with no warning.
3. **Field state never re-syncs from the server.** `useState(initialValue)` runs once. When User A types and saves, User B's open card still shows whatever B had locally — and worse, if B then types and saves, B's text overwrites A's because B's local copy doesn't include A's changes. Not a race condition we can ignore for a multi-auditor workflow.

Bonus issue affecting findings/risk levels visibility (not a save bug, but contributes to the perception of "nothing saved"): risk-level buttons and "Add Finding" submit are one-shot mutations and *do* persist correctly — but `section_summary` for every section is empty in the DB, which means the auditor's narrative work is the biggest casualty.

### What I'll change

#### 1. `src/components/audit/workspace/QuestionCard.tsx` — auditor notes per question
- Replace the cancel-on-unmount cleanup with a **flush-on-unmount**: if a debounce timer is pending, fire `onNote(question.id, notes)` immediately before unmounting.
- Add `onBlur` handler on the `<Textarea>` that flushes the pending debounce and calls `onNote` immediately. So clicking out of the field always commits.
- Re-sync `notes` state when `response?.id` changes or when `response?.notes` changes from the server *and* the textarea is not currently focused — this prevents stale local state from clobbering another user's save.

#### 2. `src/components/audit/workspace/DocumentReviewPhase.tsx` — `SectionSummaryField`
- Same three changes: flush on unmount, flush on blur, re-sync on server update when not focused.

#### 3. `src/components/audit/workspace/OpeningMeetingPhase.tsx` — `SummaryField`
#### 4. `src/components/audit/workspace/ClosingMeetingPhase.tsx` — `ClosingSummaryField`
- Same three changes applied to both meeting summary fields.

#### 5. `src/pages/AuditWorkspaceNew.tsx` — global safety net
- Add a `beforeunload` listener while there are any unsaved fields. Implementation: a tiny `useUnsavedAuditWork` context with a `dirtyCount` ref that fields increment on type and decrement on save; if `dirtyCount > 0`, the browser prompts before close/refresh.
- Tab switch (Form → Findings/Report/etc.) inside the workspace will work correctly because of fixes 1–4 (flush on unmount). The `beforeunload` handler is only for the harder cases: hard navigation, tab close, browser back.

#### 6. Lightweight save-state indicator
- Show a small "Saving…" / "All changes saved" pill at the top of the audit form area, driven by the same dirty counter. Auditors get explicit confirmation their work landed — no more "did it save?" anxiety.

### What this does NOT change

- No schema changes. RLS is fine (verified — staff have full read/write via `is_vivacity_team_safe`).
- No change to ratings/findings/risk-level buttons — those use one-shot mutations and already persist correctly.
- No change to the existing 500–800 ms debounce intervals (still good UX, low write volume).
- Realtime live-cursor / live-presence is out of scope; we only ensure server is the source of truth and other users' saves don't get clobbered when a stale tab eventually saves.

### Verification after implementation

1. Type notes in a question card → switch phase tab within 1 s → return → notes still there (DB row updated).
2. Type a section summary → close the browser tab → reopen → summary present.
3. User A and User B both have the audit open. A types in Q5 notes and tabs out; B refreshes within a few seconds and sees A's text in Q5.
4. Save indicator transitions Saving → Saved within ~1 s of the last keystroke.

### Out of scope (deferred)

- Realtime presence / live cursors.
- Conflict UI when two users edit the same field simultaneously (we accept last-write-wins, but the re-sync fix narrows the window dramatically).
- Restoring the data already lost from the Davies session — the typing was never sent to the server, so we can't recover it. The auditor will need to re-enter the lost narrative; the fixes above will keep it safe from this point on.

