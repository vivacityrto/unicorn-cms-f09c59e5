# Audit: 2026-10-27 — Rock lifecycle: archive, restore, guarded delete, change history

**Trigger:** ad-hoc (Rock editor redesign, stage 3 of 3: Archive, Restore, Delete)
**Scope:** `public.eos_rocks` and its hosted Supabase project `1. Unicorn 2.0-dev`
(`yxkgdalkbrriasiyyrwk`): one new table, four triggers, five functions.
**Status: applied** on 27 Oct 2026 on Carl's explicit instruction, to
`unicorn-qa` first (version `20261027084909`) and then to the configured project
(version `20261027085500`), after the stage 2 migration (`20261027150000`), and
verified on both (see Verification). Neither migration depends on the other.

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
- The migration is applied, so this change can merge. Before it was applied,
  archive, restore and the impact check would have reported the functions as
  missing, which is why it had to be applied first.

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
- Applied to `unicorn-qa`, then to the configured project, as the migration
  file's exact content. Verified on both afterwards: all eight function bodies
  (stage 2 and stage 3) have the same md5 and length as the bodies in the files;
  each function exists once; `rock_impact`, `archive_rock` and `restore_rock` are
  executable by `authenticated` and not by `anon` or `PUBLIC`; the trigger and
  helper functions are executable by neither; `eos_rock_events` has row-level
  security on, one select policy, and `SELECT` only for `authenticated`; the
  four new triggers are enabled beside the three existing ones.
- `unicorn-qa` has no EOS data (no tenant 6372, no teams), so it was also checked
  with a rolled-back smoke test on another tenant: history, `created_by`, level
  lock, delete refused with a child and allowed with nothing attached, impact,
  archive with children, restore refused under an archived parent and allowed
  with it, non-staff refused. Afterwards QA had 0 Rocks and 0 events.
- Live check against the applied functions on the configured project, in a
  transaction that rolled back: archive with children (2 Rocks), restore with
  children (2), `rock_impact` (1 child), a real Rock with a linked issue refused
  for deletion with its reasons, a non-staff user refused. Afterwards: 156 Rocks,
  1 archived (as before), 0 `[TEST]` Rocks, 0 history rows, 498 milestones, 15
  linked issues, 40 milestone links, 24 outcomes, all unchanged.

## Rollback
Apply `rollback/20261027160000_rock_lifecycle.down.sql`. Archived Rocks stay
archived (restore them first if needed). History recorded so far is dropped.
