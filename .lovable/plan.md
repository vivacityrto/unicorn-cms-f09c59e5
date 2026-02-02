

# Fix: Segment Navigation Skipping Scorecard

## Problem Analysis

When clicking "Next Segment" from Segue, the UI jumps directly to Rock Review, skipping Scorecard. The database shows Scorecard WAS visited briefly (started at 00:05:35, completed at 00:05:41 - only 6 seconds), suggesting a rapid double-click or race condition caused two segment advances instead of one.

## Root Cause

The "Next Segment" button relies solely on `disabled={advanceSegment.isPending}` to prevent duplicate clicks. However, React Query mutations complete very quickly, and there's a brief window between when `isPending` becomes `false` and when the UI fully re-renders with the new segment. During this window, a second click can register.

## Solution

Implement multiple safeguards to prevent accidental segment skipping:

1. **Add mutation throttling** - Prevent re-triggering within a short cooldown period
2. **Use await for mutation** - Ensure the button stays disabled until the query cache is updated
3. **Show visual feedback** - Add a brief loading state after advancement

---

## Implementation

### 1. Update useEosMeetingSegments Hook

Add async/await pattern and return a promise so the caller can wait for full completion:

**File:** `src/hooks/useEosMeetingSegments.tsx`

```typescript
const advanceSegment = useMutation({
  mutationFn: async () => {
    const { data, error } = await supabase.rpc('advance_segment', {
      p_meeting_id: meetingId,
    });
    
    if (error) throw error;
    return data;
  },
  onSuccess: async () => {
    // Wait for cache invalidation to complete
    await queryClient.invalidateQueries({ 
      queryKey: ['eos-meeting-segments', meetingId] 
    });
    toast({ title: 'Advanced to next segment' });
  },
  onError: (error: Error) => {
    toast({ title: 'Error advancing segment', description: error.message, variant: 'destructive' });
  },
});
```

### 2. Add Click Throttle in LiveMeetingView

Add local state to track recent navigation and prevent rapid clicks:

**File:** `src/components/eos/LiveMeetingView.tsx`

```typescript
// Add state for navigation cooldown
const [isNavigating, setIsNavigating] = useState(false);

// Wrap the advance handler with protection
const handleAdvanceSegment = async () => {
  if (isNavigating) return;
  setIsNavigating(true);
  
  try {
    await advanceSegment.mutateAsync();
  } finally {
    // Keep disabled briefly to prevent double-clicks
    setTimeout(() => setIsNavigating(false), 500);
  }
};

// Similarly for previous segment
const handlePreviousSegment = async () => {
  if (isNavigating) return;
  setIsNavigating(true);
  
  try {
    await goToPreviousSegment.mutateAsync();
  } finally {
    setTimeout(() => setIsNavigating(false), 500);
  }
};
```

### 3. Update Button Disabled State

Update both navigation buttons to use the combined disabled state:

```typescript
<Button 
  onClick={handlePreviousSegment} 
  size="sm" 
  variant="outline"
  disabled={isNavigating || goToPreviousSegment.isPending}
>
  <SkipBack className="h-4 w-4 mr-2" />
  Previous
</Button>

<Button 
  onClick={handleAdvanceSegment} 
  size="sm" 
  variant="outline"
  disabled={isNavigating || advanceSegment.isPending}
>
  <SkipForward className="h-4 w-4 mr-2" />
  Next Segment
</Button>
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useEosMeetingSegments.tsx` | Add `await` to `invalidateQueries` for proper sequencing |
| `src/components/eos/LiveMeetingView.tsx` | Add navigation cooldown state and handler wrappers |

---

## Expected Outcome

After implementation:
- Clicking "Next Segment" will have a 500ms cooldown before allowing another navigation
- The button will remain disabled until the query cache is fully updated
- Double-clicks or rapid clicks will be ignored
- Each segment will display fully before the next navigation is possible

---

## Technical Details

The solution uses two layers of protection:

1. **React Query's isPending** - Prevents clicks during the actual API call
2. **Local isNavigating state with timeout** - Extends the disabled period by 500ms after the mutation completes, ensuring the UI has time to re-render with the new segment data

This follows the pattern recommended by the Lovable stack overflow for preventing navigation state issues during route/segment changes.

