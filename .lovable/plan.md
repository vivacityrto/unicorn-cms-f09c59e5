

# Fix: Download PDF and Schedule Next QC Buttons

## Problem
Both buttons in `src/pages/EosQCSession.tsx` (lines 421-428) are rendered without `onClick` handlers, so they do nothing when clicked.

## Plan

### 1. Download PDF Button
- Wire it to `window.print()` — consistent with the existing print pattern used elsewhere (see `src/components/ui/print.tsx` `triggerPrint()`).
- The page already renders all QC content, so printing produces a usable PDF via the browser's "Save as PDF" option.

### 2. Schedule Next QC Button  
- The `scheduleNext` mutation already exists in `useQuarterlyConversations()` and calls `qc_schedule_next` RPC.
- Destructure `scheduleNext` from the hook (currently only `startMeeting` and `upsertAnswer` are destructured at line 29).
- Wire the button's `onClick` to call `scheduleNext.mutate({ qc_id: qc.id })`.
- After success, navigate to the newly created QC (the RPC returns the new QC ID).

### Changes — single file: `src/pages/EosQCSession.tsx`
1. Line 29: Also destructure `scheduleNext` from `useQuarterlyConversations()`.
2. Lines 421-428: Add `onClick` handlers:
   - Download PDF: `onClick={() => window.print()}`
   - Schedule Next QC: `onClick` calls `scheduleNext.mutate(...)` with the current QC ID, then navigates to the new QC on success.

