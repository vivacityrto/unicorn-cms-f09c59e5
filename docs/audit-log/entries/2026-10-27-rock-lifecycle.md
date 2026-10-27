# Audit: 2026-10-27 — Rock lifecycle: archive, restore, guarded delete, change history

**Trigger:** ad-hoc (Rock editor redesign, stage 3 of 3: Archive, Restore, Delete)
**Scope:** `public.eos_rocks` and its hosted Supabase project `1. Unicorn 2.0-dev`
(`yxkgdalkbrriasiyyrwk`): one new table, three triggers, five functions.
**Status: drafted and dry-run only. The migration has not been applied to
`unicorn-qa` or to the configured project;** applying it needs Carl's explicit
approval. Stacked on the stage 2 migration (`20261027150000`), which is also
not yet applied; neither depends on the other being applied first.

## Findings
- Archive was a bare `UPDATE archived_at`. Child Rocks stayed active pointing at
  an archived parent, nothing recorded who archived what, and the screen's
  copy promised a restore that did not exist.
- Delete only checked for children in the browser. The table's own rules would
  have deleted a Rock that has started milestones, linked tasks, Company-milestone
  links or recorded outcomes (they cascade or dangle); only issues were protected,
  by a foreign key. Production holds 15 issues linked to Rocks, 498 milestones,
  40 milestone links and 24 recorded outcomes.
- Nothing recorded who changed a Rock's status, owner, due date, parent or level.
- `created_by` was set only by the upsert function; a direct insert left it null.
- No other code or job deletes Rocks (searched `src`, `supabase/functions`,
  migrations), so a delete guard breaks no existing flow.

## KB changes shipped
- no changes

## Code changes (if this entry accompanies one)
- `supabase/migrations/20261027160000_rock_lifecycle.sql`:
  - `eos_rock_events` (append-only, no foreign key so history outlives a deleted
    Rock, RLS select for the same people who can read the Rock, no write grants)
    and `trg_record_eos_rock_event` recording created / updated / archived /
    restored / deleted with the actor and the changed fields (title, status,
    owner, due date, parent, level, team, quarter, client, priority, archive).
  - `trg_set_eos_rock_created_by`: fills `created_by` on every insert path.
  - `rock_delete_blockers()` and `trg_guard_eos_rock_delete`: a Rock with child
    Rocks (archived ones included), linked issues, started or evidenced
    milestones, linked tasks, Company-milestone links or recorded outcomes cannot
    be deleted, for any caller. Such a Rock is archived instead.
  - `rock_impact()`: counts for the confirmation screen (staff only).
  - `archive_rock()` / `restore_rock()`: atomic, staff only. Archiving can include
    the Rocks that serve it, all stamped with one timestamp; restoring refuses an
    archived parent unless asked to restore it too, and can restore exactly the
    Rocks archived together.
  - Trigger functions are revoked from `PUBLIC`, `anon` and `authenticated`, as in
    the earlier trigger-hardening migrations.
- `supabase/migrations/rollback/20261027160000_rock_lifecycle.down.sql`: drops
  the triggers, functions and the history table; Rocks are untouched.
- `supabase/migration-safety-allowlist.json`: reviewed findings through 2026-11-27.
- `src/hooks/useRockLifecycle.ts`, `src/components/eos/rocks/RockLifecycleDialog.tsx`,
  `ArchivedRocksPanel.tsx`, `detail/RockHistory.tsx`, `src/utils/rockLifecycle.ts`:
  an impact-first confirmation for archive, delete and restore; an Archived tab;
  a "Recent changes" section in the Rock details panel.
- `src/hooks/useEosRocksHierarchy.tsx`, `RockCard.tsx`, `EosRocks.tsx`: the old
  direct archive and delete mutations and the card's own confirmation are removed.
- `src/integrations/supabase/types.ts`: hand-added entries for the new table and
  functions, matching the generated shape, until the next regeneration.
- Until the migration is applied, the Archived tab works (it only reads archived
  Rocks), but archive, restore and the impact check will report the functions as
  missing, and the history section says history is not available yet. The
  migration should be applied before or together with this change.

## Verification
- Dry run against the configured project inside one transaction that rolled back
  (new objects created, exercised as an active staff user and as a non-staff
  user, then undone). Results: history recorded `created` and an `updated` with
  before and after for a title and status change, and nothing for an untracked
  description change; a direct insert took `created_by` from the caller; deleting
  a Rock whose only milestone was not started succeeded and wrote a `deleted`
  event; deleting a Rock with a started milestone, with a child Rock, with a
  linked issue (real data) and with a recorded outcome (real data) was refused,
  each naming its reasons; single archive and restore worked, archiving twice and
  restoring an active Rock were refused; archiving a tree stamped all three Rocks
  with one timestamp; restoring a child of an archived parent was refused, and
  succeeded with `include_parents`; restoring with children brought back only the
  Rocks archived together, not one archived earlier on its own; `rock_impact`
  matched independent counts on the real Rock with the most children; a non-staff
  user was refused by `rock_impact`, `archive_rock` and `restore_rock`; and all
  155 existing active Rocks could be archived without one failure (so none is
  blocked by the scope trigger).
- After the dry run: 156 Rocks, 1 archived (already archived before), 0 `[TEST]`
  Rocks, no history table, none of the new functions or triggers.
- `unicorn-qa` has no EOS data; apply there first, with approval, and re-run the
  checks that do not need Rock rows.

## Rollback
Apply `rollback/20261027160000_rock_lifecycle.down.sql`. Archived Rocks stay
archived (restore them first if needed). History recorded so far is dropped.
