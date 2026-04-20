

## Issue
The screenshot shows the "Explicit Confirmations (if applicable)" section listing **"NO IDS ITEMS REQUIRED THIS WEEK"** and **"NO TO-DOS REQUIRED"** as available checkboxes. The user reads this as the system *claiming* nothing happened — but actually:

- Database confirms **6 To-Dos** and **3 Issues** (1 marked as discussed) exist for this meeting
- The validation function correctly detected this — the **only** real unmet requirement is *"Not enough ratings: 1 submitted, need 4"*
- The two yellow-highlighted boxes are just unconditional opt-out checkboxes that the dialog **always** renders for L10 meetings, regardless of whether work was done

## Root cause
In `MeetingCloseValidationDialog.tsx`, `L10_OUTCOMES` is rendered as a static list under "Explicit Confirmations (if applicable)" — there is no conditional logic to hide them when To-Dos/IDS items already exist. The labels ("No IDS items required", "No To-Dos required") are misleading in that context: a facilitator who *did* create To-Dos sees a checkbox suggesting otherwise.

## Fix plan

### Change 1 — Hide irrelevant confirmations (`MeetingCloseValidationDialog.tsx`)
Filter `L10_OUTCOMES` (and the equivalents for other meeting types) before rendering, based on actual data from the validation result:
- Hide `no_todos_required` when `validation.todos_count > 0`
- Hide `no_ids_required` when `validation.issues_discussed > 0`
- Apply the same pattern to Same Page (`no_decisions_required`, `alignment_achieved`) and Annual (`no_risks_required`) — only hide when the corresponding count is non-zero

If **all** outcomes for the meeting type are hidden, hide the entire "Explicit Confirmations" section heading and helper text too.

### Change 2 — Add a positive summary line
At the top of the Confirmations section (or replacing it when empty), show a small green confirmation card listing what *was* captured, e.g.:
- ✓ 6 To-Dos created
- ✓ 1 IDS issue discussed (3 linked)

This makes the meeting close feel like an audit-ready summary, not a list of opt-outs.

### Change 3 — No DB changes required
`validate_meeting_close` already returns `todos_count` and `issues_discussed` correctly. No migration needed.

## Files to change
- `src/components/eos/MeetingCloseValidationDialog.tsx` — conditional rendering of outcome checkboxes + new positive-summary block

