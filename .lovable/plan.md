

# Fix: Meeting Status Not Transitioning to "in_progress"

## Problem Summary

Clicking "Close Meeting" does nothing because the meeting status is still `scheduled` instead of `in_progress`.

The database confirms:
- Meeting ID: `40eef3bc-25f8-4769-b445-2408d3c418b4`
- Status: `scheduled`
- `started_at`: NULL

The close RPC correctly returns: `"Meeting must be in progress to close"`

## Root Cause

The `startFirstSegment` mutation in `LiveMeetingView.tsx` only updates the segment's timestamp and `is_complete` flag. It does NOT:
- Set `status = 'in_progress'`
- Set `started_at` on the meeting

The proper RPC (`start_meeting_with_quorum_check`) exists and correctly handles this, but the UI bypasses it.

### Code Analysis

**Current (broken) - lines 173-193 of LiveMeetingView.tsx:**
```typescript
const startFirstSegment = useMutation({
  mutationFn: async () => {
    // Only updates segment started_at
    const { error } = await supabase
      .from('eos_meeting_segments')
      .update({ started_at: new Date().toISOString() })
      .eq('id', firstSegment.id);
    
    // Only updates is_complete, NOT status
    if (!meeting?.is_complete) {
      await supabase
        .from('eos_meetings')
        .update({ is_complete: false })
        .eq('id', meetingId);
    }
  },
});
```

**What should happen:**
The meeting status should transition to `in_progress` when the first segment starts.

---

## Solution

Modify the `startFirstSegment` mutation to also set the meeting `status = 'in_progress'` and `started_at = now()` when starting the first segment.

### Implementation

Update `src/components/eos/LiveMeetingView.tsx` lines 173-193:

```typescript
const startFirstSegment = useMutation({
  mutationFn: async () => {
    if (!segments?.length) throw new Error('No segments available');
    const firstSegment = segments.find(s => !s.started_at);
    if (!firstSegment) throw new Error('No pending segments');
    
    // Start the first segment
    const { error } = await supabase
      .from('eos_meeting_segments')
      .update({ started_at: new Date().toISOString() })
      .eq('id', firstSegment.id);
    
    if (error) throw error;

    // Update meeting to in_progress (the key fix)
    const { error: meetingError } = await supabase
      .from('eos_meetings')
      .update({ 
        status: 'in_progress',
        started_at: new Date().toISOString(),
        is_complete: false 
      })
      .eq('id', meetingId);

    if (meetingError) throw meetingError;
  },
  // ... rest unchanged
});
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/eos/LiveMeetingView.tsx` | Update `startFirstSegment` to set `status = 'in_progress'` and `started_at` |

---

## Immediate Fix for Current Meeting

Since the current meeting already has segments that were started but the status never transitioned, we also need to fix the existing meeting record.

**One-time database fix:**
```sql
UPDATE eos_meetings 
SET status = 'in_progress', 
    started_at = (
      SELECT MIN(started_at) 
      FROM eos_meeting_segments 
      WHERE meeting_id = '40eef3bc-25f8-4769-b445-2408d3c418b4'
    )
WHERE id = '40eef3bc-25f8-4769-b445-2408d3c418b4'
  AND status = 'scheduled';
```

This will allow the current meeting to be closed.

---

## Expected Outcome

1. Existing meeting will transition to `in_progress`
2. "Close Meeting" will work (no more "must be in progress" error)
3. Future meetings will correctly set status when starting

---

## Testing Checklist

1. Apply the database fix for the current meeting
2. Refresh the live meeting page
3. Click "Close Meeting"
4. Confirm meeting closes and redirects to summary
5. Start a new meeting and verify status transitions correctly

