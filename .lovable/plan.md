## Fix: Double-click required on Next/Previous Segment buttons in L10 live meeting view

**File:** `src/components/eos/LiveMeetingView.tsx` (only file touched)

### Root cause recap
- `isNavigating` is React state, so rapid clicks both pass the `if (isNavigating)` guard before React commits the update → `advance_segment` RPC fires twice → segment skipped.
- No spinner on the button, so during the silent `segmentsFetching` window users learn to double-click.

### Changes

1. **Replace state lock with a synchronous ref** (around line 55)
   - Remove: `const [isNavigating, setIsNavigating] = useState(false);`
   - Add: `const isNavigatingRef = useRef(false);`
   - Add a small piece of state purely to trigger re-renders for the button's disabled/spinner UI:
     `const [isNavigatingUI, setIsNavigatingUI] = useState(false);`
   - Ensure `useRef` and `useState` are imported (useState already is; add `useRef` if missing).

2. **Update `handleAdvanceSegment`** (lines 341–350)
   ```ts
   const handleAdvanceSegment = async () => {
     if (isNavigatingRef.current || segmentsFetching) return;
     isNavigatingRef.current = true;
     setIsNavigatingUI(true);
     try {
       await advanceSegment.mutateAsync();
     } finally {
       setTimeout(() => {
         isNavigatingRef.current = false;
         setIsNavigatingUI(false);
       }, 1000);
     }
   };
   ```
   - Ref flip happens before `await`, so a second synchronous click is blocked immediately.
   - `finally` guarantees reset on both success and error (no stuck button).
   - Keep the 1000ms safety window.

3. **Update `handlePreviousSegment`** (lines 352–360) with the identical ref + UI-state pattern wrapping `goToPreviousSegment.mutateAsync()`.

4. **Button disabled state + spinner** (lines 815–837)
   - Replace `isNavigating` references in the `disabled` props with `isNavigatingUI`.
   - Previous button (line 820):
     `disabled={isNavigatingUI || goToPreviousSegment.isPending || segmentsFetching}`
     Swap `SkipBack` icon for `Loader2` (spin) when `isNavigatingUI || goToPreviousSegment.isPending`.
   - Next button (line 832):
     `disabled={isNavigatingUI || advanceSegment.isPending || segmentsFetching}`
     Same conditional spinner swap on `SkipForward`.
   - Import `Loader2` from `lucide-react` if not already imported; apply `className="h-4 w-4 mr-2 animate-spin"`.

### Not changed
- `useEosMeetingSegments` hook
- `advance_segment` / `go_to_previous_segment` RPCs
- `segmentsFetching` guard
- 1000ms safety timeout
- Start Meeting / End Meeting / close dialog flow
- Agenda sidebar, progress bar, segment rendering
- Realtime sync via `useMeetingRealtime`

### Why a ref + a UI-state flag
The ref provides synchronous, race-proof gating between rapid clicks. A separate state flag is needed only so React re-renders the button into its disabled/spinner state — refs alone don't trigger re-renders. Both are flipped together, so they cannot drift.

### Verification
- Rapid double-click Next: only one RPC fires, advances exactly one segment, spinner shown briefly, button re-enables after settle.
- Rapid double-click Previous: same behaviour, single step back.
- Forced RPC error (e.g. offline): toast shown, button re-enables after 1s.
- Start Meeting, End Meeting, agenda sidebar, realtime updates all still work.
