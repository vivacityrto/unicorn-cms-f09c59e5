## Fix: "Meeting must be in progress to close" blocks L10 close

Two independent fixes, both narrowly scoped.

### Fix 1 — `src/components/eos/LiveMeetingView.tsx` (`startFirstSegment`, lines 286–296)

Replace the silent `UPDATE eos_meetings` with a verifying update that uses `.select()` and checks the returned row.

```ts
const { data: updatedMeeting, error: meetingError } = await supabase
  .from('eos_meetings')
  .update({
    status: 'in_progress',
    started_at: now,
    is_complete: false,
  })
  .eq('id', meetingId)
  .select('id, status')
  .maybeSingle();

if (meetingError) throw meetingError;
if (!updatedMeeting || updatedMeeting.status !== 'in_progress') {
  throw new Error('Failed to start meeting — please try again or contact support.');
}
```

- Catches RLS-silent zero-row updates (PostgREST returns `{ data: null, error: null }`).
- `onError` (already present at line 303) shows the toast verbatim, so the existing handler is sufficient.
- Segment update at lines 279–284 unchanged.

### Fix 2 — Database migration: `close_meeting_with_validation(uuid, boolean)`

Only the **two-argument** overload is changed. The single-arg overload (no `p_force`) is left exactly as-is.

Change the status gate at lines 85–87 of the two-arg version to allow force-close when the meeting has at least one segment that was actually started:

```sql
IF v_meeting.status != 'in_progress' AND NOT (
  p_force AND EXISTS (
    SELECT 1 FROM public.eos_meeting_segments
    WHERE meeting_id = p_meeting_id AND started_at IS NOT NULL
  )
) THEN
  RETURN json_build_object('success', false, 'error', 'Meeting must be in progress to close');
END IF;
```

Everything else is preserved exactly:
- `SECURITY DEFINER`, `SET search_path = ''` → `'public'` (kept as-is, fully qualified `public.eos_meeting_segments` in the new EXISTS).
- Quorum check.
- `GREATEST(1, FLOOR(v_present_count * 0.5))` ratings requirement.
- Validation errors + `p_force` warning bypass at line 107.
- `UPDATE eos_meetings SET status='closed', completed_at, updated_at`.
- `generate_meeting_summary` call with swallowed exception.
- `audit_eos_events` rows for `meeting_validation_failed` and `meeting_closed` (force-flag and skipped warnings already captured).
- `trg_auto_generate_next_meeting` fires on the same UPDATE — untouched.

Migration uses `CREATE OR REPLACE FUNCTION` with the full body of the two-arg version including the single line change, so the single-arg overload is not dropped or affected.

### Not changed
- Single-arg `close_meeting_with_validation(uuid)` overload.
- `generate_meeting_summary`, `audit_eos_events`, `trg_auto_generate_next_meeting`.
- `MeetingCloseValidationDialog`, "Close Anyway" UI, ratings/quorum logic.
- `FacilitatorSelectDialog`, "End Meeting" button visibility (`meetingStarted`).
- `eos_meeting_segments` start logic in `startFirstSegment`.

### Backward compatibility and risk
- Past closed meetings: RPC only inspects the meeting being closed → no impact.
- Scheduled meeting never started, `p_force = true`: blocked, because `started_at IS NOT NULL` requires at least one segment that was started. Correct behaviour preserved.
- Scheduled-but-actually-started meeting (the bug scenario): allowed to close, status set to `closed`. Audit row records `forced=true`.
- Already-closed meeting: status is `closed`, not `in_progress`, and bypass requires `p_force`; without `p_force` it returns the existing error. With `p_force` and started segments it would re-close — harmless, just re-runs UPDATE and re-emits an audit event. Acceptable; matches prior behaviour for the existing `p_force` path on warnings.
- No new permissions, no new tables, no signature change → frontend `.rpc('close_meeting_with_validation', { p_meeting_id, p_force })` continues to resolve to the two-arg overload unchanged.
- RLS unaffected; function is `SECURITY DEFINER`.

### Verification steps
1. Manually flip a meeting to `status='scheduled'` with started segments → "Close Anyway" succeeds, status becomes `closed`, audit event written with `forced=true`.
2. Meeting with `status='scheduled'` and no segment `started_at` → "Close Anyway" still blocked with the existing error.
3. Healthy `in_progress` meeting with ratings/quorum → normal close works unchanged.
4. New meeting start: confirm `eos_meetings.status` becomes `in_progress` (verified by `.select()`); if RLS blocks the update, user sees the new descriptive toast instead of false "Meeting started".

### Summary
- Two tightly scoped fixes that together unblock meeting close and prevent the silent status drift that caused it in the first place.
- No schema changes, no signature changes, no behavioural change to closed or never-started meetings.
- Audit trail and downstream automation untouched.
