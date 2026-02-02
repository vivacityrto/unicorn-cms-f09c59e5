
# Fix: IDS Issues and To-Dos Not Being Tracked to Meeting

## Problem Summary

The Meeting Close Checklist shows 0 To-Dos and 0 Issues Discussed, even though you:
1. Discussed and solved 1 issue
2. Created 4 To-Dos from that issue

## Root Cause Analysis

### Issue 1: Backlog Issues Not Linked to Meeting

When an issue is picked from the backlog (where `meeting_id = NULL`), the IDS workflow does NOT:
- Update the issue's `meeting_id` to link it to the current meeting
- Add the issue ID to the meeting's `issues_discussed` array

**Database evidence:**
| Record | meeting_id |
|--------|------------|
| Issue `c0f54909...` | NULL |
| All 4 To-Dos | NULL |

### Issue 2: To-Dos Inherit NULL meeting_id

The `create_todos_from_issue` RPC gets the `meeting_id` from the issue:
```sql
SELECT tenant_id, meeting_id INTO v_tenant_id, v_meeting_id
FROM eos_issues WHERE id = p_issue_id;
```
Since the issue has `meeting_id = NULL`, all to-dos are created with `meeting_id = NULL`.

### Issue 3: Validation Counts Are Zero

The `validate_meeting_close` RPC counts:
- To-dos: `COUNT(*) FROM eos_todos WHERE meeting_id = p_meeting_id` (returns 0)
- Issues: `array_length(v_meeting.issues_discussed, 1)` (returns 0 because array is empty)

## Solution

Update the `set_issue_status` RPC to properly track issues when they're solved during a meeting.

### Change 1: Update set_issue_status RPC

When an issue transitions to "Solved" or "Discussing":
1. If the issue has `meeting_id = NULL` but is being processed during an active meeting, assign the meeting
2. Append the issue ID to the meeting's `issues_discussed` array when solved

**New logic to add:**
```sql
-- If issue is being solved and was previously unassigned, assign to meeting
IF p_status IN ('Discussing', 'Solved') AND v_issue.meeting_id IS NULL THEN
  -- Get the user's active meeting (if any)
  SELECT id INTO v_active_meeting_id
  FROM eos_meetings
  WHERE tenant_id = v_issue.tenant_id
    AND status = 'In Progress'
    AND id IN (
      SELECT meeting_id FROM eos_meeting_attendees 
      WHERE user_id = auth.uid() AND status = 'Present'
    )
  LIMIT 1;
  
  IF v_active_meeting_id IS NOT NULL THEN
    UPDATE eos_issues SET meeting_id = v_active_meeting_id 
    WHERE id = p_issue_id;
    
    -- Update the reference for subsequent logic
    v_issue.meeting_id := v_active_meeting_id;
  END IF;
END IF;

-- When solved, add to meeting's issues_discussed array
IF p_status = 'Solved' AND v_issue.meeting_id IS NOT NULL THEN
  UPDATE eos_meetings
  SET issues_discussed = COALESCE(issues_discussed, '{}') || ARRAY[p_issue_id]
  WHERE id = v_issue.meeting_id
    AND NOT (p_issue_id = ANY(COALESCE(issues_discussed, '{}')));
END IF;
```

### Change 2: Update create_todos_from_issue RPC

Accept an optional `p_meeting_id` parameter to explicitly assign to-dos to the correct meeting:

```sql
CREATE OR REPLACE FUNCTION public.create_todos_from_issue(
  p_issue_id uuid,
  p_todos jsonb,
  p_meeting_id uuid DEFAULT NULL  -- NEW: Optional explicit meeting ID
)
...
-- Use explicit meeting_id if provided, otherwise fall back to issue's meeting_id
v_meeting_id := COALESCE(p_meeting_id, (SELECT meeting_id FROM eos_issues WHERE id = p_issue_id));
```

### Change 3: Update Frontend IDSDialog

Pass the meeting_id explicitly when creating to-dos:

```typescript
// In IDSDialog.tsx - createTodos mutation
const { error } = await supabase.rpc('create_todos_from_issue', {
  p_issue_id: issue!.id,
  p_todos: todos as any,
  p_meeting_id: issue?.meeting_id || meetingId,  // Pass meeting context
});
```

**Requires adding meetingId prop to IDSDialog:**
```typescript
interface IDSDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: EosIssue | null;
  isFacilitator: boolean;
  meetingId?: string;  // NEW
}
```

---

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| New SQL Migration | Create | Update `set_issue_status` RPC to track issues to meetings |
| New SQL Migration | Create | Update `create_todos_from_issue` to accept `p_meeting_id` |
| `src/components/eos/IDSDialog.tsx` | Edit | Pass meetingId to RPC call |
| `src/components/eos/LiveMeetingView.tsx` | Edit | Pass meetingId to IDSDialog |

---

## Expected Behaviour After Fix

1. User picks a backlog issue during a live meeting
2. User opens IDS dialog and marks as Solved with to-dos
3. System:
   - Links the issue to the current meeting
   - Adds issue ID to meeting's `issues_discussed` array
   - Creates to-dos with the correct `meeting_id`
4. Meeting Close Checklist shows:
   - 1 Issue Discussed
   - 4 To-Dos
5. Meeting can be closed without requiring explicit confirmations

---

## Testing Checklist

After implementation:
1. Start a live meeting
2. Pick a backlog issue (one without meeting_id)
3. Mark it as Solved with 2 to-dos
4. Open Meeting Close Checklist
5. Verify: Issues Discussed = 1, To-Dos = 2
6. Confirm no explicit confirmations are required
7. Close the meeting successfully
