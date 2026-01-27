
# Plan: Fix Segment Navigation and Issue Creation

## Summary

This plan addresses three issues found during the live meeting:

1. **Rock Review Skipped** - The meeting progressed too quickly through segments because previous timestamps weren't reset properly
2. **No "Previous Segment" Button** - There's no way to navigate backward through segments
3. **Issue Creation Error** - The `create_issue` RPC is using an old function signature that passes text priority instead of converting to integer

---

## Issue Analysis

### Issue 1: Rock Review Segment Skipped

**Root Cause:**
Looking at the current database state, all segments appear to have progressed correctly:
- Segue: completed at 00:13:28
- Scorecard: completed at 00:13:29 (1 second later - too fast!)
- Rock Review: completed at 00:13:35
- Headlines: completed at 00:16:32
- To-Do List: currently active (in progress)
- IDS and Conclude: pending

The problem is the segments advanced too rapidly in succession (less than 1 second between some). This suggests someone clicked "Next Segment" multiple times or the button was clicked while a previous transition was still processing.

**Immediate Fix Needed:**
Reset the meeting segments to allow a fresh start.

---

### Issue 2: Add Previous Segment Navigation

**Current State:**
- The `advance_segment` RPC only moves forward
- No backend or frontend logic exists for moving backward
- The UI only shows a "Next Segment" button

**Solution:**
Create a new RPC function `go_to_previous_segment` and add a "Previous Segment" button to the UI that:
1. Un-completes the current active segment (clears `started_at`)
2. Re-activates the previous segment (clears `completed_at`, keeps `started_at`)

---

### Issue 3: Create Issue Error

**Error Message:**
`column 'priority' is of type integer but expression is of type text`

**Root Cause:**
There are two versions of the `create_issue` function in the database with different parameter signatures:

| Version | Parameters | Priority Handling |
|---------|------------|-------------------|
| Old (being called) | `p_source`, `p_client_id`, `p_linked_rock_id` | Passes text directly |
| New | `p_owner_id`, `p_rock_id` | Converts text to integer |

The frontend is calling with the **old** parameters (`p_source`, `p_client_id`, `p_linked_rock_id`), which matches the old function that doesn't convert priority text to integer.

**Solution:**
Update the `create_issue` RPC to accept both old and new parameter styles while always converting priority text to integer.

---

## Implementation Steps

### Step 1: Reset Meeting Segments (Database)

Clear all segment progress for the meeting so it can be restarted:

```sql
UPDATE eos_meeting_segments 
SET started_at = NULL, completed_at = NULL
WHERE meeting_id = '64a80954-66e0-40b6-b595-0fa68a1ec4bb';
```

### Step 2: Create go_to_previous_segment RPC

New database function that:
- Gets the current active segment
- Finds the most recently completed segment before it
- Clears timestamps to move backward

```sql
CREATE OR REPLACE FUNCTION public.go_to_previous_segment(p_meeting_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_segment RECORD;
  v_previous_segment RECORD;
  v_meeting RECORD;
BEGIN
  -- Verify facilitator permissions
  SELECT m.*, emp.role INTO v_meeting
  FROM public.eos_meetings m
  LEFT JOIN public.eos_meeting_participants emp 
    ON emp.meeting_id = m.id AND emp.user_id = auth.uid()
  WHERE m.id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  IF v_meeting.role != 'Leader' AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only facilitator can navigate segments';
  END IF;

  -- Get current active segment
  SELECT * INTO v_current_segment
  FROM public.eos_meeting_segments
  WHERE meeting_id = p_meeting_id
    AND started_at IS NOT NULL
    AND completed_at IS NULL;

  -- Get previous completed segment
  SELECT * INTO v_previous_segment
  FROM public.eos_meeting_segments
  WHERE meeting_id = p_meeting_id
    AND completed_at IS NOT NULL
    AND sequence_order = (
      SELECT MAX(sequence_order)
      FROM public.eos_meeting_segments
      WHERE meeting_id = p_meeting_id
        AND completed_at IS NOT NULL
        AND sequence_order < COALESCE(v_current_segment.sequence_order, 999)
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No previous segment to return to';
  END IF;

  -- Clear current segment (make it pending again)
  IF v_current_segment.id IS NOT NULL THEN
    UPDATE public.eos_meeting_segments
    SET started_at = NULL
    WHERE id = v_current_segment.id;
  END IF;

  -- Re-activate previous segment
  UPDATE public.eos_meeting_segments
  SET completed_at = NULL
  WHERE id = v_previous_segment.id;

  -- Audit log
  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, meeting_id, entity, entity_id, action, details
  ) VALUES (
    v_meeting.tenant_id, auth.uid(), p_meeting_id, 'segment', 
    v_previous_segment.id, 'segment_reverted',
    jsonb_build_object(
      'from_segment', v_current_segment.id,
      'to_segment', v_previous_segment.id
    )
  );

  RETURN v_previous_segment.id;
END;
$$;
```

### Step 3: Add Previous Segment Mutation to Hook

Update `src/hooks/useEosMeetingSegments.tsx` to include a `goToPreviousSegment` mutation:

```typescript
const goToPreviousSegment = useMutation({
  mutationFn: async () => {
    const { data, error } = await supabase.rpc('go_to_previous_segment', {
      p_meeting_id: meetingId,
    });
    if (error) throw error;
    return data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['eos-meeting-segments', meetingId] });
    toast({ title: 'Returned to previous segment' });
  },
  onError: (error: Error) => {
    toast({ title: 'Error returning to previous segment', description: error.message, variant: 'destructive' });
  },
});
```

### Step 4: Add Previous Segment Button to UI

Update `src/components/eos/LiveMeetingView.tsx` to show a "Previous Segment" button alongside "Next Segment":

```tsx
{meetingStarted && isFacilitator && completedSegments.length > 0 && (
  <Button 
    onClick={() => goToPreviousSegment.mutate()} 
    size="sm" 
    variant="outline"
    disabled={goToPreviousSegment.isPending}
  >
    <SkipBack className="h-4 w-4 mr-2" />
    Previous Segment
  </Button>
)}
```

### Step 5: Fix create_issue RPC

Drop the conflicting old function and recreate with unified signature:

```sql
-- Drop old versions
DROP FUNCTION IF EXISTS public.create_issue(bigint, text, text, text, text, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.create_issue(bigint, text, text, text, uuid, uuid, uuid);

-- Create unified version
CREATE OR REPLACE FUNCTION public.create_issue(
  p_tenant_id BIGINT,
  p_source TEXT DEFAULT 'ad_hoc',
  p_title TEXT,
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
  -- Convert text priority to integer
  v_priority_int := CASE LOWER(p_priority)
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    ELSE 2
  END;

  INSERT INTO eos_issues (
    tenant_id, client_id, title, description, priority, status,
    raised_by, rock_id, meeting_id, created_by
  ) VALUES (
    p_tenant_id, p_client_id, p_title, p_description, v_priority_int, 'open',
    auth.uid(), p_linked_rock_id, p_meeting_id, auth.uid()
  )
  RETURNING id INTO v_issue_id;

  -- Audit log
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

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| Database migration | Create | Reset segments, add `go_to_previous_segment` RPC, fix `create_issue` |
| `src/hooks/useEosMeetingSegments.tsx` | Modify | Add `goToPreviousSegment` mutation |
| `src/components/eos/LiveMeetingView.tsx` | Modify | Add "Previous Segment" button and import `SkipBack` icon |

---

## User Flow After Implementation

1. Meeting is reset - user can start fresh
2. User starts meeting via Facilitator dialog
3. During meeting:
   - **Next Segment** - advances to next agenda item (existing)
   - **Previous Segment** - returns to previously completed item (new)
4. Creating issues works correctly with priority conversion
5. Audit trail captures all segment navigation

---

## Notes

- The "Previous Segment" button only appears when there are completed segments to return to
- Only the facilitator (Leader role) can use navigation buttons
- Priority is stored as integer in the database (3=High, 2=Medium, 1=Low) but displayed as text in the UI
- The meeting reset clears all timestamps, requiring the meeting to be restarted
