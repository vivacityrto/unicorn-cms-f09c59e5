
# Plan: Reset Meeting Segments and Add Facilitator Selection at Meeting Start

## Summary

This plan addresses two issues:
1. **Reset the meeting segments** - The segments for the January 27 meeting still have timestamps from a previous test session, causing the UI to show them as already progressed
2. **Add facilitator selection at meeting start** - Currently, the facilitator is fixed at scheduling time. We need to add the ability to change/confirm the facilitator when starting the meeting

---

## Part 1: Reset Meeting Segments (Immediate Fix)

The segments table still shows progress from a previous session:
- Segue, Scorecard, Rock Review: marked as completed
- Headlines: currently in progress
- To-Do List, IDS, Conclude: pending

**Action Required:**
Clear all `started_at` and `completed_at` timestamps for meeting ID `64a80954-66e0-40b6-b595-0fa68a1ec4bb`:

```sql
UPDATE eos_meeting_segments 
SET started_at = NULL, completed_at = NULL
WHERE meeting_id = '64a80954-66e0-40b6-b595-0fa68a1ec4bb';
```

---

## Part 2: Add Facilitator Selection at Meeting Start

### Current Behaviour
- Facilitator is selected during meeting scheduling via `MeetingScheduler.tsx`
- The selected user gets `role = 'Leader'` in `eos_meeting_participants` table
- In `LiveMeetingView.tsx`, the system checks this role to enable facilitator controls
- There is no UI to change the facilitator once the meeting is scheduled

### Proposed Solution

Create a **"Start Meeting" dialog** that appears before the first segment begins, allowing the team to:
1. Confirm or change the facilitator
2. Review attendance
3. Start the meeting

### Implementation Steps

**Step 1: Create FacilitatorSelectDialog Component**

New file: `src/components/eos/FacilitatorSelectDialog.tsx`

This dialog will:
- Show the current facilitator (from `eos_meeting_participants` where `role = 'Leader'`)
- Display a dropdown of present attendees to select a new facilitator
- Update the `eos_meeting_participants` table when changed:
  - Set previous facilitator's role to `'Member'`
  - Set new facilitator's role to `'Leader'`

**Step 2: Update LiveMeetingView to Use the New Dialog**

Modify `src/components/eos/LiveMeetingView.tsx`:

- Before showing the "Start Meeting" button, check if meeting has not started
- When user clicks "Start Meeting", open the `FacilitatorSelectDialog`
- The dialog confirms facilitator selection before calling `startFirstSegment`

**Step 3: Create RPC Function to Change Facilitator**

New database function: `change_meeting_facilitator(p_meeting_id UUID, p_new_facilitator_id UUID)`

This function will:
- Verify the caller has permission (must be current Leader or SuperAdmin)
- Update the old Leader to Member role
- Update the new user to Leader role
- Log the change to `audit_eos_events`

**Step 4: Create useFacilitatorChange Hook**

New file: `src/hooks/useFacilitatorChange.tsx`

This hook will:
- Fetch current facilitator from `eos_meeting_participants`
- Provide mutation to change facilitator via the RPC
- Invalidate relevant queries on success

---

## Technical Details

### Database Changes

```sql
-- RPC function to change facilitator
CREATE OR REPLACE FUNCTION public.change_meeting_facilitator(
  p_meeting_id UUID,
  p_new_facilitator_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_old_leader_id UUID;
BEGIN
  -- Get meeting and verify permissions
  SELECT m.*, emp.role, emp.user_id INTO v_meeting
  FROM eos_meetings m
  LEFT JOIN eos_meeting_participants emp 
    ON emp.meeting_id = m.id AND emp.user_id = auth.uid()
  WHERE m.id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  -- Only current Leader or SuperAdmin can change facilitator
  IF v_meeting.role != 'Leader' AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only current facilitator or admin can change facilitator';
  END IF;

  -- Get current leader
  SELECT user_id INTO v_old_leader_id
  FROM eos_meeting_participants
  WHERE meeting_id = p_meeting_id AND role = 'Leader';

  -- Demote old leader to Member
  UPDATE eos_meeting_participants
  SET role = 'Member'
  WHERE meeting_id = p_meeting_id AND role = 'Leader';

  -- Promote new facilitator to Leader
  UPDATE eos_meeting_participants
  SET role = 'Leader'
  WHERE meeting_id = p_meeting_id AND user_id = p_new_facilitator_id;

  -- If new facilitator wasn't a participant, add them
  IF NOT FOUND THEN
    INSERT INTO eos_meeting_participants (meeting_id, user_id, role, attended)
    VALUES (p_meeting_id, p_new_facilitator_id, 'Leader', false);
  END IF;

  -- Audit log
  INSERT INTO audit_eos_events (
    tenant_id, user_id, meeting_id, entity, action, details
  ) VALUES (
    v_meeting.tenant_id,
    auth.uid(),
    p_meeting_id,
    'meeting',
    'facilitator_changed',
    jsonb_build_object(
      'old_facilitator', v_old_leader_id,
      'new_facilitator', p_new_facilitator_id
    )
  );

  RETURN true;
END;
$$;
```

### New Component Structure

```text
+----------------------------------+
|     FacilitatorSelectDialog      |
+----------------------------------+
| "Select Facilitator for Meeting" |
|                                  |
| Current: [John Smith ▼]          |
|                                  |
| [Team Member Dropdown]           |
|   - Jane Doe                     |
|   - Bob Wilson                   |
|   - Sarah Johnson                |
|                                  |
| +------------+ +---------------+ |
| |   Cancel   | | Start Meeting | |
| +------------+ +---------------+ |
+----------------------------------+
```

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/eos/FacilitatorSelectDialog.tsx` | Create |
| `src/hooks/useFacilitatorChange.tsx` | Create |
| `src/components/eos/LiveMeetingView.tsx` | Modify - integrate dialog before start |
| Database migration | Create - add `change_meeting_facilitator` RPC |

---

## User Flow After Implementation

1. User navigates to the live meeting view
2. Meeting shows "Start Meeting" button (segments not yet started)
3. Clicking "Start Meeting" opens the Facilitator Select Dialog
4. User can:
   - Keep current facilitator and start
   - Select a different team member as facilitator, then start
5. Dialog closes, first segment begins
6. Facilitator controls (Next Segment, End Meeting) are now available to the selected facilitator

---

## Notes

- The facilitator can only be changed **before** the meeting starts (first segment begins)
- Once the meeting starts, the facilitator is locked for that session
- Audit trail captures all facilitator changes
- The `isFacilitator` check in `LiveMeetingView.tsx` will automatically reflect the updated role
