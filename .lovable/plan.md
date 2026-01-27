
# Plan: Fix Level 10 Meeting Critical Issue - Status Enum Mismatch

## Summary

The audit identified one **critical issue** preventing Issue creation in Level 10 meetings. The `create_issue` RPC uses `'identified'` as the status value, but this is not a valid `eos_issue_status` enum value.

---

## Root Cause Analysis

### The Problem

The `create_issue` RPC function contains this INSERT statement:

```sql
INSERT INTO eos_issues (
  tenant_id, client_id, title, description, priority, status,
  raised_by, linked_rock_id, meeting_id, created_by
) VALUES (
  p_tenant_id, p_client_id, p_title, p_description, v_priority_int, 'identified',  -- INVALID!
  auth.uid(), p_linked_rock_id, p_meeting_id, auth.uid()
)
```

### Valid Enum Values

The `eos_issue_status` enum contains these values:
- `Open` (should be used as initial status)
- `Discussing`
- `Solved`
- `Archived`
- `In Review`
- `Actioning`
- `Escalated`
- `Closed`

Note: The enum value is **case-sensitive** - it must be `'Open'` not `'open'`.

---

## Implementation Plan

### Step 1: Fix create_issue RPC (Database Migration)

Update the RPC to use `'Open'` as the initial status:

```sql
CREATE OR REPLACE FUNCTION public.create_issue(
  p_tenant_id BIGINT,
  p_source TEXT DEFAULT 'ad_hoc',
  p_title TEXT DEFAULT '',
  p_description TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'medium',
  p_client_id UUID DEFAULT NULL,
  p_linked_rock_id UUID DEFAULT NULL,
  p_meeting_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue_id UUID;
  v_priority_int INTEGER;
BEGIN
  -- Convert text priority to integer (high=3, medium=2, low=1)
  v_priority_int := CASE LOWER(p_priority)
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    ELSE 2
  END;

  -- Insert issue with 'Open' as initial status (valid eos_issue_status enum value)
  INSERT INTO eos_issues (
    tenant_id, client_id, title, description, priority, status,
    raised_by, linked_rock_id, meeting_id, created_by
  ) VALUES (
    p_tenant_id, p_client_id, p_title, p_description, v_priority_int, 'Open',
    auth.uid(), p_linked_rock_id, p_meeting_id, auth.uid()
  )
  RETURNING id INTO v_issue_id;

  -- Audit log entry
  INSERT INTO audit_eos_events (
    tenant_id, user_id, meeting_id, entity, entity_id, action, reason, details
  ) VALUES (
    p_tenant_id, auth.uid(), p_meeting_id, 'issue', v_issue_id, 'created',
    'Issue created from ' || p_source,
    jsonb_build_object('source', p_source, 'priority', p_priority)
  );

  RETURN v_issue_id;
END;
$$;
```

---

### Step 2: Update Priority Display in IssuesQueue Component (Optional Enhancement)

Map integer priority to human-readable labels in `src/components/eos/IssuesQueue.tsx`:

The current `getPriorityColor` function already handles this mapping:
```typescript
const priorityStr = typeof priority === 'number' 
  ? (priority >= 3 ? 'high' : priority >= 2 ? 'medium' : 'low')  // Updated thresholds
  : priority;
```

Current thresholds (8, 5) should be adjusted to match database values (3, 2, 1).

---

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| Database migration | Create | Fix `create_issue` RPC to use `'Open'` status |
| `src/components/eos/IssuesQueue.tsx` | Modify (optional) | Fix priority threshold mapping |

---

## Verification Checklist

After implementation, verify:

| Test | Expected Result |
|------|-----------------|
| Create Issue from IDS segment | Issue created with status `Open` |
| Issue appears in Issues Queue | Priority displays correctly as High/Medium/Low |
| IDS Dialog opens for issue | Issue details load correctly |
| Set issue status to Solved | Status updates with audit log |

---

## Working Components (No Changes Needed)

These components have been verified as working correctly:

1. **Meeting Segments Navigation** - Previous/Next buttons work
2. **Participants Query** - FK join syntax is correct
3. **Attendees Query** - FK join syntax is correct
4. **Headlines** - Create/delete works
5. **To-Dos** - Create/update works
6. **Meeting Ratings** - Save/retrieve works
7. **Meeting Close Validation** - Requirements validated per meeting type
8. **Facilitator Selection** - Participants load with names

---

## Technical Notes

### Enum Case Sensitivity
PostgreSQL enums are case-sensitive. The database uses PascalCase: `Open`, `Discussing`, `Solved`, etc.

### Audit Trail Preservation
The fix maintains all audit logging in `audit_eos_events` table.

### No Frontend Changes Required
The frontend already handles the status values correctly since it displays the status from the database.
