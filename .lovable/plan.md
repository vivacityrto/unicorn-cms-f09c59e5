## Problem

The Start Meeting button was previously broadened so any Vivacity staff attendee can start the meeting (`canStartMeeting`). But the in-meeting controls — Previous, Next Segment, and Close Meeting — in `src/components/eos/LiveMeetingView.tsx` (lines ~876–910) are still gated by `isFacilitator`. So whoever started the meeting (a non-facilitator staff member) can't advance from Segue, and the designated facilitator may not be present, leaving the meeting stuck.

## Fix (frontend only, `LiveMeetingView.tsx`)

1. Reuse the same permission model as `canStartMeeting`: any active Vivacity-staff attendee may control the meeting. Introduce `canControlMeeting` = `canStartMeeting` (same derivation from `attendees` + `isVivacityStaffRole(profile.unicorn_role)`).
2. Replace the `isFacilitator` gate on:
   - Previous segment button
   - Next Segment button
   - Close Meeting button
   with `canControlMeeting`.
3. Leave the "start" logic and facilitator-name display untouched.

No backend, RPC, or RLS changes — the underlying `advanceSegment` / `goToPreviousSegment` / close mutations already work for any authenticated staff user.

## Verification

- Typecheck.
- Confirm a non-facilitator Vivacity staff attendee sees Previous / Next Segment / Close Meeting after starting the meeting and can advance past Segue.