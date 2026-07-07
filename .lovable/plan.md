## Scope
Two related fixes to the EOS L10 meeting close flow.

### Prompt A — Facilitator-only, unconstrained close
1. **Migration**: `CREATE OR REPLACE FUNCTION public.close_meeting_with_validation(p_meeting_id uuid, p_force boolean DEFAULT false)`
   - After resolving `v_meeting` and `v_current_user_id`, add authorization:
     - If no `eos_meeting_participants` rows exist for the meeting → allow (bootstrap).
     - Else if caller is not `role = 'Leader'` for this meeting → return `{success:false, error:'Only the meeting facilitator can end this meeting'}`.
   - Remove the early return when `array_length(v_validation_errors,1) > 0 AND NOT p_force`. Still compute `v_validation_errors` and include them in the `audit_eos_events` details payload written on close.
   - Keep existing `status != 'in_progress'` guard (with segment-started_at exception) untouched.
   - REVOKE from anon/PUBLIC, GRANT EXECUTE to authenticated.

2. **`src/components/eos/MeetingCloseValidationDialog.tsx`**
   - Remove `showForceCloseConfirm` state and its two-step confirm branch (around line 421).
   - Single "End Meeting" button calls `closeMeeting.mutateAsync()` directly and navigates on success.
   - Keep "Missing Requirements" card as informational only — never blocks the button.

3. **`src/components/eos/LiveMeetingView.tsx`** (line 270)
   - Replace `isFacilitator` computation with the three-branch version: `undefined → false`, `[] → true`, else membership check for `Leader`.

### Prompt B — Per-attendee rating, live + post-close
1. **`src/components/eos/LiveMeetingView.tsx`**
   - Add a "Rate this meeting" card near the "All Segments Complete!" card, rendered when `allSegmentsComplete` is true, outside any `isFacilitator` gating.
   - 1–10 button row (same style as `MeetingCloseValidationDialog.tsx`) → `saveRating.mutate(n)`; highlight current user's rating from `getUserRating(profile?.user_uuid)`.

2. **`src/components/eos/PastMeetingSummary.tsx`**
   - Import `useMeetingOutcomes` (keyed on `meeting.id`) and `useAuth`.
   - Below the existing average-rating display, add the same 1–10 control so viewers can submit/update their own rating on a closed meeting.

### Out of scope
No changes to RLS policies, `save_meeting_rating`, `eos_meeting_ratings`, other RPCs, or unrelated components/pages.

## Technical notes
- Migration is DDL-only (`CREATE OR REPLACE FUNCTION`) — single call.
- `useMeetingOutcomes` already exposes `saveRating`/`getUserRating` and works for closed meetings (no status check in RPC).
- `useAuth` provides `profile.user_uuid` used consistently in both components.

## Files touched
- `supabase/migrations/<new>.sql` — `close_meeting_with_validation` rewrite + revoke/grant
- `src/components/eos/MeetingCloseValidationDialog.tsx`
- `src/components/eos/LiveMeetingView.tsx`
- `src/components/eos/PastMeetingSummary.tsx`
