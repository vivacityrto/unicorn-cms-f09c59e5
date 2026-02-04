
# Fix: Milestone Duplication When Adding New Milestones

## Problem Summary

When adding milestones to a Rock, they duplicate unless removed first. The screenshot shows 6 identical milestones with the same text, all repeating the same content.

## Root Cause Analysis

The issue is in the `useEffect` that syncs the form state with the `rock` prop in `RockFormDialog.tsx`:

```tsx
useEffect(() => {
  if (rock) {
    // ... sets milestones from rock.milestones
    setMilestones(savedMilestones);
  }
}, [rock]);
```

**The Problem:**
1. User opens the dialog - `useEffect` loads milestones from database (e.g., 1 milestone)
2. User adds a new milestone - state now has 2 milestones
3. User saves - `updateRock.mutateAsync()` is called
4. `queryClient.invalidateQueries({ queryKey: ['eos-rocks'] })` triggers
5. The `rocks` query refetches, giving the `rock` prop a **new object reference**
6. The `useEffect` runs again because `rock` dependency changed
7. The effect reloads milestones from the now-updated database (2 milestones)
8. If timing is off or there's any async overlap, this can cause duplicates

**Additional Issue:**
The `useEffect` runs on every `rock` reference change, not just when the rock ID changes. This means even after saving, if the dialog is still mounted, it re-syncs state with database data.

---

## Solution

Implement a stable initialization pattern that:
1. Only initializes form state when the **rock ID changes** (not just reference)
2. Tracks whether the form has been initialized to prevent re-runs
3. Properly resets initialization state when dialog closes

### File: `src/components/eos/RockFormDialog.tsx`

**Changes:**

1. **Add initialization tracking state**
```tsx
const [isInitialized, setIsInitialized] = useState(false);
const previousRockId = useRef<string | null>(null);
```

2. **Update useEffect to check rock ID, not reference**
```tsx
useEffect(() => {
  // Only reinitialize if rock ID actually changed or dialog just opened
  const rockId = rock?.id ?? null;
  
  if (rockId !== previousRockId.current || (open && !isInitialized)) {
    previousRockId.current = rockId;
    
    if (rock) {
      setTitle(rock.title || '');
      setDescription(rock.description || '');
      setIssue((rock as any)?.issue || '');
      setProblemSolved((rock as any)?.outcome || '');
      
      // Parse milestones from JSON
      const savedMilestones = (rock as any)?.milestones;
      if (Array.isArray(savedMilestones)) {
        setMilestones(savedMilestones);
      } else {
        setMilestones([]);
      }
      
      setClientId(rock.client_id || '');
      setSeatId(rock.seat_id || '');
      setOwnerId((rock as any)?.owner_id || '');
      setStatus(rock.status || 'on_track');
      setPriority(rock.priority || 1);
      setQuarterNumber(rock.quarter_number || Math.ceil((new Date().getMonth() + 1) / 3));
      setQuarterYear(rock.quarter_year || new Date().getFullYear());
      setDueDate(rock.due_date ? rock.due_date.split('T')[0] : '');
    } else {
      resetForm();
    }
    
    setIsInitialized(true);
  }
}, [rock?.id, open]);
```

3. **Reset initialization state when dialog closes**
```tsx
// Add effect to reset init flag when dialog closes
useEffect(() => {
  if (!open) {
    setIsInitialized(false);
    previousRockId.current = null;
  }
}, [open]);
```

4. **Import useRef**
```tsx
import { useState, useEffect, useMemo, useRef } from 'react';
```

---

## Technical Details

| Change | Location | Purpose |
|--------|----------|---------|
| Add `useRef` import | Line 1 | Track previous rock ID |
| Add `isInitialized` state | After line 59 | Prevent re-initialization |
| Add `previousRockId` ref | After line 59 | Compare IDs, not references |
| Update `useEffect` | Lines 62-86 | Use ID comparison instead of reference |
| Add dialog close effect | After main useEffect | Reset tracking when dialog closes |

### Why This Works

1. **ID-based comparison**: Only re-initializes when the actual rock ID changes, not when the object reference changes due to query cache updates
2. **Initialization flag**: Prevents the effect from running multiple times while the dialog is open
3. **Dialog close cleanup**: Ensures fresh initialization when reopening the dialog

---

## Expected Behavior After Fix

1. Open Rock edit dialog with existing milestone
2. Add new milestone by clicking "Add Milestone"
3. Enter milestone text
4. Click Save
5. Milestones are saved correctly without duplication
6. Reopen the dialog - milestones show correctly (no duplicates)

---

## Risk Assessment

**Low risk** - This is a targeted fix to the form initialization logic. It uses React's standard `useRef` pattern for tracking previous values, which is a well-established pattern for preventing unnecessary effect runs.
