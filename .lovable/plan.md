
Goal
- Fix the remaining IDS “Cannot transition from ‘Open’ to ‘Solved’” error shown in the screenshot when clicking “Mark as Solved”, even though the dialog now attempts to transition Open → Discussing → Solved.

What’s actually happening (root cause)
- IDSDialog’s setStatus mutation validates transitions using issue?.status (props) at mutation execution time:
  - const currentStatus = issue?.status || 'Open'
- During handleSolve:
  1) We call setStatus.mutateAsync({ status: 'Discussing' })
  2) Immediately after, we call setStatus.mutateAsync({ status: 'Solved' })
- The issue prop does not update to “Discussing” instantly (it updates after the query invalidation/refetch). So the second mutateAsync still sees issue.status === 'Open' and fails client-side validation for Open → Solved.
- This matches the toast: Allowed: Discussing, In Review, Archived (meaning “Solved” is not allowed directly from “Open”).

Design decision
- Keep client-side transition validation (it’s helpful UX), but make it deterministic by validating against an explicit “from status” that the caller provides, rather than reading a potentially stale prop.
- This matches the existing pattern already used elsewhere in the app (see useRisksOpportunities.updateItem which accepts currentStatus as an argument).

Planned changes (minimal + isolated)

1) Update IDSDialog setStatus mutation to accept an explicit fromStatus/currentStatus
- File: src/components/eos/IDSDialog.tsx
- Change setStatus.mutationFn signature from:
  - ({ status, solutionText, autoAdvanceTab = true })
  to:
  - ({ status, solutionText, autoAdvanceTab = true, fromStatus })
- Validation will use:
  - const effectiveFrom = fromStatus ?? issue?.status ?? 'Open'
- Error message will reference effectiveFrom.

2) Update all calls to setStatus to pass the correct fromStatus
- File: src/components/eos/IDSDialog.tsx
- handleSolve:
  - Determine currentStatus once at the top:
    - const currentStatus = issue?.status || 'Open'
  - If currentStatus === 'Open':
    - await setStatus.mutateAsync({ status: 'Discussing', fromStatus: 'Open', autoAdvanceTab: false })
    - await setStatus.mutateAsync({ status: 'Solved', fromStatus: 'Discussing', solutionText: solution })
  - Else:
    - await setStatus.mutateAsync({ status: 'Solved', fromStatus: currentStatus, solutionText: solution })
- Identify tab “Start Discussing” button:
  - Change onClick to:
    - setStatus.mutate({ status: 'Discussing', fromStatus: issue.status })
- Any other status updates in this component should pass fromStatus: issue.status (or a known value).

3) (Small correctness fix) Discuss tab disabled condition uses wrong case
- File: src/components/eos/IDSDialog.tsx
- Current code:
  - disabled={!isFacilitator && issue.status !== 'discussing'}
- Status enums are case-sensitive (“Discussing”), so non-facilitators may be incorrectly blocked or enabled.
- Update to:
  - disabled={!isFacilitator && issue.status !== 'Discussing'}
- This is a safe, isolated fix and aligns with the rest of the component’s case-sensitive status usage.

Why this will solve the issue
- The second transition (Discussing → Solved) will validate against fromStatus: 'Discussing' immediately, without waiting for React Query to refetch and update the issue prop.
- Backend behavior remains the same; we are only fixing the frontend’s validation reference.

Testing checklist (end-to-end)
1) Open a live meeting and open an issue in status “Open”.
2) Go directly to the Solve tab, enter a solution, click “Mark as Solved”.
   - Expected: no toast error; status updates and dialog closes.
3) Verify the issue is now “Solved” in the queue/list after refetch.
4) Repeat with an issue already in “Discussing”:
   - Expected: Discussing → Solved succeeds.
5) Confirm to-do creation still works after solving (when todos are added).
6) Non-facilitator view:
   - Confirm discussion notes field enable/disable behavior is correct in Discuss tab.

Files touched
- src/components/eos/IDSDialog.tsx

Non-goals (explicitly not changing)
- No database/RPC changes.
- No changes to status transition rules.
- No changes to the IDS tab auto-sync logic beyond fixing validation correctness.
