
# Fix EOS Meeting Attendance Panel UI and Backend

## Problem
Two issues causing attendance to not work:

1. **Backend bug**: The `add_meeting_guest` RPC function casts `p_user_id::TEXT` when inserting into `audit_eos_events.entity_id` (which is UUID). This causes a 400 error every time an online user auto-joins or a guest is manually added. Since auto-attendance relies on this RPC, the attendee list stays empty ("No attendees yet") despite users being online.

2. **Layout clipping**: The attendance panel sits in a `w-72` (288px) sidebar, which clips the "Mark All Present" and "Add Guest" buttons.

## Fix 1: Patch `add_meeting_guest` RPC (SQL migration)

Re-create the `add_meeting_guest` function, removing the `::TEXT` cast on line 398 of the original definition:

```sql
-- Before (broken):
entity_id, ...  VALUES ( ... p_user_id::TEXT, ... )

-- After (fixed):
entity_id, ...  VALUES ( ... p_user_id, ... )
```

This is a single-line fix in a new migration file. The function signature stays the same.

## Fix 2: Attendance panel layout for narrow sidebar

In `AttendancePanel.tsx`, adjust the action buttons area:
- Stack buttons vertically (`flex-col`) instead of horizontally to prevent clipping in the 288px sidebar
- Make buttons full-width (`w-full`) so they're clearly tappable
- Reduce internal padding slightly for the narrow context

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/<new>.sql` | New migration: recreate `add_meeting_guest` without `::TEXT` cast |
| `src/components/eos/AttendancePanel.tsx` | Stack action buttons vertically for narrow sidebar |

## Expected Outcome

- Online users auto-register as attendees (no more 400 errors)
- "Mark All Present" and "Add Guest" buttons fully visible and clickable
- Attendee list populates correctly with avatars, names, and status dropdowns
