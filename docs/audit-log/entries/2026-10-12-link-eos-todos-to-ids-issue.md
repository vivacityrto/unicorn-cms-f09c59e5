# Audit: 2026-10-12 — link-eos-todos-to-ids-issue

**Trigger:** ad-hoc (reported during the 12 Oct 2026 L10: "when I click the IDS I can't see the to-do I added")
**Scope:** `public.eos_todos`, `public.create_todos_from_issue`, the completed-meeting guard
`protect_todos_in_completed_meeting`, and the IDS dialog, in production
(`yxkgdalkbrriasiyyrwk`). Did not change RLS policies or grants, `set_issue_status`, or
which meeting a new IDS to-do is attached to (see open questions).

## Findings
- A to-do created in IDS carried no reference to its issue. `create_todos_from_issue()` took
  the issue id as input but only used it to look up the tenant and meeting, and recorded it in
  the `audit_eos_events` row (`entity_id` = issue, `details.from_issue`) rather than on the
  to-do. So the IDS dialog could only list the to-dos added in the current browser session
  (local React state) and lost them on close; to-dos made earlier, by someone else, or before a
  refresh were invisible from the issue.
- Marking an issue Solved does not touch to-dos: `set_issue_status` only updates the issue,
  `eos_meetings.issues_discussed` and the audit log. Nothing deleted or completed a to-do.
- Existing IDS to-dos can be matched back to their issues reliably: the RPC inserts the to-dos
  and its `bulk_create` audit row in one transaction, so they share `created_at`, `created_by`
  and `tenant_id`, and the audit row's `entity_id` is the issue. 19 of 33 to-dos match (the
  other 14 were created directly in the To-Do List, not from an issue); each matches exactly
  one audit row and none crosses tenants.
- `eos_todos` has table-level grants, so a new column needs no new grant. Its RLS is unchanged.
- Checking the dry run showed a second consequence: an `ON DELETE SET NULL` foreign key would
  rewrite `issue_id` when an issue is deleted, and the closed-meeting guard (which only lets
  status / completed_at / due_date / updated_at through) would block that update for to-dos
  of closed meetings, making such an issue undeletable. `issue_id` is link metadata, so the
  guard now lets it through.

## Code changes (if this entry accompanies one)
- `supabase/migrations/20261012030000_link_eos_todos_to_issue.sql`:
  - `eos_todos.issue_id uuid REFERENCES eos_issues(id) ON DELETE SET NULL` + partial index
  - `create_todos_from_issue(uuid, jsonb, uuid)` (same signature, `CREATE OR REPLACE`, no new
    overload) now writes `issue_id = p_issue_id`
  - `protect_todos_in_completed_meeting()` also lets `issue_id` change on a closed meeting's
    to-do; all other protections unchanged
  - one-off backfill of the 19 matched to-dos
- `src/integrations/supabase/types.ts`, `src/types/eos.ts`: `issue_id` added.
- `src/components/eos/IDSDialog.tsx`: the Solve tab now lists the issue's to-dos from the
  database (title, owner, due date, Open/Done) instead of a session-only list.
  `useMeetingTodos.tsx` and `LiveMeetingView.tsx` invalidate that list when a to-do is
  created, ticked, re-dated, or changed by another attendee.
- Tests: `IDSDialog.todos.test.tsx` (queries by issue id; shows owner/due/status; empty state).

## Verification
Dry run against production in a transaction that was deliberately rolled back (nothing
persisted): backfill updated 19 rows, 0 tenant mismatches; a to-do created through the RPC
carried the issue id; title edit and delete on a closed meeting's linked to-do were still
blocked; deleting an issue with a to-do in a closed meeting succeeded, kept the to-do and
cleared its `issue_id`.

## Decisions
- Link by a real column rather than parsing audit rows at read time: it is queryable, indexed
  and survives audit-log pruning.
- `ON DELETE SET NULL`: deleting an issue must not delete the work that came out of it.
- Backfill from the audit trail rather than leaving history unlinked; only exact matches.
- **Rollback:** `DROP INDEX idx_eos_todos_issue_id; ALTER TABLE eos_todos DROP COLUMN issue_id;`
  then recreate the previous `create_todos_from_issue` (see
  `20261012010000_drop_legacy_create_todos_from_issue_2arg.sql` lineage / `20260202024836_…`)
  and the guard from `20261012020000_allow_status_change_on_carried_over_eos_todos.sql`.

## Open questions parked
- **Meeting link:** the RPC uses `issue.meeting_id` first, and all 10 unsolved issues belong
  to closed meetings, so a to-do added from one of them is attached to that old meeting and
  shows "From an earlier meeting" in the To-Do List. Attaching it to the meeting in progress
  would be more accurate. Same root cause: solving such an issue records it under the old
  meeting's `issues_discussed`.
- Issues carried between meetings are not re-linked to the new meeting.
