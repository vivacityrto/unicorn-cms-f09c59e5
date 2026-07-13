## Problem

On the L10 Live Meeting screen (`src/components/eos/LiveMeetingView.tsx`), two things are broken:

1. **No one can click Start Meeting.** The gate is `canStartMeeting = isVivacityStaff && isMeetingParticipant`, where `isMeetingParticipant` requires the signed-in user to appear in `eos_meeting_participants` for this meeting. That table is populated by a background `sync_l10_meeting_participants` RPC, and the sidebar people actually see is fed by a different table (`eos_meeting_attendees`). Attendees who show up in the UI can still be missing from `eos_meeting_participants`, which silently disables the button — the message just says "Waiting for the facilitator to start…". For "Weekly L10 – 13 Jul 2026" (`c7eb06a1-060f-4825-840a-8b1c261a147a`), the DB confirms 16 attendees but only 14 participants, and only one of them (Nova Canto) is stored as `Leader`.

2. **No visible facilitator.** The Leader role lives in `eos_meeting_participants.role='Leader'` and is never rendered anywhere. The sidebar shows attendance role (`Attendee` / `Core Team`) and status (`Invited`), so viewers cannot tell who the facilitator is.

## Fix (frontend only)

### 1. Broaden the Start Meeting gate

In `src/components/eos/LiveMeetingView.tsx`, replace the participants-table check with an attendees-table check that matches what the user actually sees in the sidebar:

- Add a query (or reuse `useMeetingAttendance`) to load `eos_meeting_attendees` for the meeting.
- Change `canStartMeeting` to: `isVivacityStaffRole(profile?.unicorn_role) && attendees.some(a => a.user_id === profile?.user_uuid)`.
- Keep the "Vivacity staff only" restriction so client-tenant users still can't start.
- Keep both existing button locations (sticky header + preview card) gated on the same value.
- Update the fallback message from "Waiting for the facilitator to start the meeting…" to something honest, e.g. "Only Vivacity staff listed as attendees can start this meeting." shown when the user is signed in but not on the attendee list.

### 2. Show who the facilitator is

Still in `LiveMeetingView.tsx`, derive `facilitator` from `participants` (the row with `role='Leader'`, joined name from the existing `users!eos_meeting_participants_user_id_users_fkey` embed) and render it in two places:

- **Meeting Preview card** (the "Waiting for facilitator…" area, ~line 989–1009): add a line "Facilitator: {name}" above the Start button. If no Leader is assigned, show "Facilitator: not assigned" in muted text.
- **Sticky header** (near the "4 online" indicator, ~line 851): add a small "Facilitator: {name}" chip so it stays visible once the meeting is running.

No changes to the attendance sidebar itself, no schema changes, no RLS changes, no edge functions.

### Files touched

- `src/components/eos/LiveMeetingView.tsx` — gate logic, facilitator display, fallback copy.

### Out of scope

- Reconciling `eos_meeting_participants` vs `eos_meeting_attendees` (data-model cleanup).
- Letting client-tenant attendees start meetings.
- Changing who is stored as `Leader` or adding a UI to reassign the facilitator.
