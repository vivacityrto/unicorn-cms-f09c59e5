

# Fix: Create Missing "go_to_previous_segment" Database Function

## Problem Analysis

When clicking "Previous" segment, you see the error:
> "Could not find the function public.go_to_previous_segment(p_meeting_id) in the schema cache"

The function was defined in migration `20260127002040` but was never deployed to the database. Checking the database confirms only `advance_segment` exists - there is no `go_to_previous_segment` function.

## Solution

Create a new database migration that adds the `go_to_previous_segment` RPC function, matching the pattern used by `advance_segment`.

---

## Implementation

### Database Migration

Create a new migration with the `go_to_previous_segment` function:

```sql
-- Create go_to_previous_segment RPC function
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

  -- Get previous completed segment (most recently completed)
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

  -- Re-activate previous segment (clear completed_at)
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

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/[timestamp]_add_go_to_previous_segment.sql` | Creates the missing RPC function |

---

## How It Works

The function:

1. **Verifies permissions** - Only the meeting facilitator (Leader role) or SuperAdmin can navigate segments
2. **Finds current segment** - The one with `started_at` set but no `completed_at`
3. **Finds previous segment** - The most recently completed segment before the current one
4. **Clears current segment** - Sets `started_at = NULL` to return it to pending state
5. **Re-activates previous segment** - Sets `completed_at = NULL` so it becomes the active segment
6. **Logs the action** - Creates an audit trail entry

---

## Expected Outcome

After the migration is applied:
- Clicking "Previous" will return to the prior segment
- The current segment will reset to pending status
- Full audit trail of segment navigation is maintained
- Both Next and Previous navigation will work correctly

