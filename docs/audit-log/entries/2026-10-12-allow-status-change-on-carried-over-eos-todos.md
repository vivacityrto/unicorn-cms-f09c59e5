# Audit: 2026-10-12 — allow-status-change-on-carried-over-eos-todos

**Trigger:** drift-surfaced (reported live during the 12 Oct 2026 L10: "we can't change the status" of to-dos from an earlier meeting)
**Scope:** the `trg_protect_todos_in_completed_meeting` trigger on `public.eos_todos` in
production (`yxkgdalkbrriasiyyrwk`) and the live To-Do List segment. Did not change
`eos_headlines`, RLS policies, or the shared `protect_completed_meeting_data()` function.

## Findings
- #1404 made the live To-Do List segment show every open to-do from earlier meetings
  (carry-over) so they can be reviewed with a Yes/No tick. Ticking one calls
  `useMeetingTodos.updateTodo`, a plain `UPDATE eos_todos`.
- `trg_protect_todos_in_completed_meeting` (BEFORE UPDATE OR DELETE) runs the shared
  `protect_completed_meeting_data()` function, which raises `Cannot modify data for
  completed meeting. Create a new item instead.` for any change to a row whose meeting is
  `closed` or `completed`.
- All 21 carried-over open to-dos belong to closed meetings (the other 3 open to-dos belong
  to the in-progress L10 and were unaffected), so every tick on a carried-over item failed.
  Not an RLS problem: `eos_todos_update` already allows any Vivacity team member.
- The two features contradicted each other: carry-over exists precisely so unfinished
  to-dos outlive their meeting, but the freeze treated them as meeting history.
- Pre-existing gap noticed on the way: the shared function checks
  `COALESCE(NEW.meeting_id, OLD.meeting_id)`, so an UPDATE that moves a closed meeting's
  to-do to an open meeting passes. The replacement guard checks the old meeting.

## Code changes (if this entry accompanies one)
- `supabase/migrations/20261012020000_allow_status_change_on_carried_over_eos_todos.sql`:
  new `protect_todos_in_completed_meeting()` trigger function and the trigger re-pointed at
  it. For a to-do whose meeting is closed/completed:
  - `status`, `completed_at`, `updated_at` changes: **allowed**
  - any other column changed (title, owner, due date, `meeting_id`, ...): blocked
  - `DELETE`: blocked
  - moving a to-do into a closed/completed meeting: blocked
  Behaviour for to-dos of open meetings is unchanged.
- No frontend change.

## Verification
Dry run against production inside a transaction that was deliberately rolled back (all
state confirmed unchanged afterwards: old trigger function still attached, new function
absent, 24 open to-dos, no edited titles). Nine cases against real rows:
1. mark complete (closed meeting) — allowed
2. reopen — allowed
3. title edit (closed) — blocked
4. status + title together (closed) — blocked
5. delete (closed) — blocked
6. move out of the closed meeting — blocked
7. move an open-meeting to-do into a closed meeting — blocked
8. title edit (in-progress meeting) — allowed
9. delete (in-progress meeting) — allowed

## Decisions
- Narrow the guard rather than drop it: closed-meeting to-dos stay protected from edits
  and deletes; only the review action (done / not done) is opened up. A to-do's due date
  and owner are still frozen once its meeting closes; if the team wants to re-date
  carried-over items during review, that is a separate, deliberate widening.
- New function rather than editing `protect_completed_meeting_data()`, which
  `eos_headlines` still depends on. No signature change, so no overload risk.
- **Rollback:** re-point the trigger at the old shared function:
  `DROP TRIGGER trg_protect_todos_in_completed_meeting ON public.eos_todos;` then
  `CREATE TRIGGER trg_protect_todos_in_completed_meeting BEFORE DELETE OR UPDATE ON public.eos_todos FOR EACH ROW EXECUTE FUNCTION protect_completed_meeting_data();`
  (the new function can then be dropped).

## Open questions parked
- Do the L10 attendees want to change the due date or owner of a carried-over to-do during
  review? Today only done / not done works.
- `eos_issues` rows from closed meetings are not covered by this trigger (it is on
  `eos_todos` and `eos_headlines` only); worth checking if IDS issues carry over the same
  way and hit a similar freeze elsewhere.
