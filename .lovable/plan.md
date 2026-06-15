## Change

In `src/components/eos/LiveMeetingView.tsx`, inside the `startFirstSegment` mutation (around lines 292–306), after the `eos_meetings` status update to `'in_progress'` succeeds and is verified, fire (without awaiting) a call to the RPC for L10 meetings:

```ts
if (meeting?.meeting_type === 'L10') {
  // Fire-and-forget: do not block navigation/UI on participant sync
  void supabase.rpc('sync_l10_meeting_participants', { p_meeting_id: meetingId });
}
```

- Placed immediately after the `if (!updatedMeeting || updatedMeeting.status !== 'in_progress')` guard, before the mutation resolves.
- Uses `void` (not `await`) so the mutation `onSuccess` and any downstream navigation proceed immediately.
- Gated on `meeting.meeting_type === 'L10'` (already in scope via the component's `meeting` query).

No other files touched. No DB migration. No changes to `onSuccess`, navigation, or other flows.