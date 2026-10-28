# Rock blockers, carryover and the Company → Individual view

> **Last updated:** 2026-10-28 · **Reconsider by:** 2027-01-28 · **Confidence:** high on the data model and the database rules (each rule was run against `unicorn-qa` in rolled-back transactions); medium on the screens (tested with mocked data and a throwaway browser harness, not with real Rock data).
>
> **Status: built, in a pull request, not applied anywhere.** The migration has not been applied to `unicorn-qa` or production. Release steps are at the end.

## Plan (written before editing)

**Design principles** (from the deeper-task review): record a blocker at the moment it happens, inline, in about thirty seconds, without a new screen; treat carrying work forward as a conscious re-commitment, with a preview of the effect before anything is saved; never let a status carry two meanings; keep the card scannable and put the detail in the panel Carl and the team already use.

**What existed.** A Rock-level status (`eos_rocks.status`, free text, five values in `dd_rock_status`) and a milestone-level status (a CHECK with `not_started, in_progress, blocked, complete, off_track, deferred`). An unused `status_note` text column on `eos_rocks`. A Company ↔ Individual milestone link table (`eos_rock_milestone_links`). No record of why anything was blocked, and no relation between a Rock and the Rock that continues it in a later quarter (the only carryover signal was `rock_outcomes`, matched by title).

**Decisions.**

| Question | Decision | Why |
| --- | --- | --- |
| Reuse `status_note` for blockers? | **No**, a new table | A blocker needs structured fields (dependency, next action and owner, review date, evidence), history of resolved blockers, and a guarantee that a reason exists. One free-text column cannot give any of those. `status_note` stays unused. |
| Add Rock-level `blocked`? | **Yes**, as a value, not a constraint | `eos_rocks.status` has no CHECK, so no constraint changes. A `dd_rock_status` row, the UI vocabulary and a database rule that a blocked Rock needs an open blocker. Milestones already had `blocked`. |
| Blocked vs at risk vs off track vs complete | Four distinct meanings, with distinct words, colours and icons | At risk = might slip. Off track = late against plan. Blocked = cannot move until something outside it changes. Complete = done. Blocked is violet with a ban icon, so it is not confused with red off track, at every level (Rock badge, milestone badge, timeline, bars). |
| Carried-over source milestones: mark `deferred`? | **No** | `deferred` removes a milestone from the progress denominators, which would change the source quarter's record. Carried-ness is a relation, not a status. The source is never modified. |
| Extend the Company ↔ Individual link table for carryover? | **No**, separate tables | The spec says not to overload it. Carryover is its own relation. The only interaction is that the carryover also creates the equivalent Company ↔ Individual links between the *destination* milestones. |

## Data model

```
eos_rock_blockers                       (one open row per Rock, one per milestone)
  rock_id | milestone_id (exactly one)  tenant_id (composite FK for milestones)
  reason (required, 1–1000)             dependency_note
  depends_on_rock_id | depends_on_milestone_id (at most one; never itself; same tenant)
  next_action  next_action_owner_id (active staff)  review_date  evidence_url (http/https)
  status_before  recorded_by/at         resolved_at/by  resolution_note

eos_rock_carryovers                     one row per (source Rock, destination Rock)
  source_rock_id → eos_rocks (RESTRICT)  destination_rock_id → eos_rocks (RESTRICT)
  reason (required)  carried_by/at  UNIQUE (source, destination)

eos_rock_carryover_milestones           provenance, one row per carried milestone
  carryover_id (composite FK)  source_milestone_id | destination_milestone_id (SET NULL on delete)
  source_title, source_status, source_due_date   ← snapshot, so history survives edits and deletes
  new_due_date                           ← the destination's target, stored apart from the original
  UNIQUE (source_milestone_id)  UNIQUE (destination_milestone_id)   ← carried at most once
```

Functions (all `SECURITY DEFINER`, empty `search_path`, staff only, not callable by `anon`): `set_blocker(subject, id, jsonb)`, `resolve_blocker(subject, id, status, note)`, `carry_forward_rock(source, destination, milestones, reason)`. The tables have `SELECT` policies and no write grants: every write goes through a function.

## Rules, and where each is enforced

| Rule | Enforced by |
| --- | --- |
| A Rock or milestone cannot become blocked without a reason | A **deferred constraint trigger** on `eos_rocks` and `eos_rock_milestones` refuses a commit that leaves an item blocked with no open blocker. It judges the row as it stands at commit, so blocking and unblocking inside one transaction is fine. Rows already blocked before this migration are not re-judged. |
| The reason is not blank | `NOT NULL`, `length(btrim(reason)) BETWEEN 1 AND 1000`, and the function |
| One open blocker per item | Partial unique indexes |
| A blocker cannot depend on itself, on two things, or across tenants | CHECK constraints and a `BEFORE` trigger |
| Evidence is a web link | CHECK `^https?://` (and the screen only links http/https) |
| Resolving never completes work | `resolve_blocker` refuses `complete` and `blocked`; it offers only the statuses work can resume at |
| Leaving blocked by any route (the editor, a script) closes the blocker | An `AFTER UPDATE OF status` trigger writes the resolution note "Status changed to …" |
| Completed work and archived Rocks cannot be blocked | `set_blocker` |
| Carry only incomplete work, never copy completed work | `carry_forward_rock` and a trigger on the provenance table |
| A milestone is carried at most once | `UNIQUE (source_milestone_id)` and the function's message |
| One carryover per pair of Rocks | `UNIQUE (source, destination)` (a second call for the same pair adds milestones to it) |
| Same tenant, same level, strictly later quarter, destination not archived | `BEFORE INSERT` trigger on `eos_rock_carryovers` |
| No loops | A recursive check in the same trigger (the later-quarter rule already makes a loop impossible; the check is a second line of defence) |
| Company → Individual structure holds in the destination | If the source's parent was carried, the destination must serve that parent's destination. A new destination Rock defaults to it. |
| A carried milestone belongs to the source Rock and the destination milestone to the destination Rock | Trigger on the provenance table |
| The source is never changed | `carry_forward_rock` has no `UPDATE`/`DELETE` of Rocks or milestones (also asserted by a test) |
| A Rock in a carryover cannot be deleted | `ON DELETE RESTRICT`, and `rock_delete_blockers()` reports `carryover` so the screen explains it (archive instead) |
| Deleting a milestone keeps its provenance | `ON DELETE SET NULL (column)` plus the title/status/date snapshot |

## Roll-up: how a blocked Individual Rock affects its Company Rock

A blocked child is **neither off track nor complete**. It does not turn the Company Rock red, it does not count as done, and it never completes the parent. The Company Rock keeps its own progress status and shows a blocked count beside the off-track count. Only when **every child that is not complete is blocked** does the Company Rock show as Blocked, because then nothing remaining can move. An at-risk or off-track sibling still makes the parent off track, blocked or not. Implemented in `computeRollupStatus` and `getChildStats` (`src/utils/rockRollup.ts`) and tested in `src/test/eos/rock-rollup-blocked.test.ts`.

## User flow

1. **Mark as blocked** (footer of the Rock panel, or inside a milestone's details). One required field: what is blocking it. Optional: what it depends on (another Rock, or a milestone on this Rock), the next action and who owns it, when to check again, a link. Saving sets the status to Blocked in one step.
2. A blocked Rock shows a violet **Blocked** panel at the top of its details with the reason, dependency (a link to the other Rock), next action and owner, the next check (flagged when overdue), the evidence link, who recorded it and when, and what it was before. Buttons: **Edit blocker**, **Resolve**. A blocked milestone shows its reason on its row without expanding.
3. **Resolve** asks only where the work resumes (defaulting to what it was before) and an optional note. **Complete is never offered**: resolving a blocker does not finish the work. The blocker moves to **Past blockers** (history).
4. **Carry forward** (footer): choose a new Rock in a later quarter (default the next one, due at quarter end) or an existing later Rock that fits; tick the milestones that come with it (incomplete ones are ticked, completed and already-carried ones are shown but not selectable); optionally give each a new target date; say why. A preview states the effect before saving: what is copied, that the original is unchanged and not completed, and that completed work stays.
5. The source shows **Carried forward to** (Q1 2027 · title · status · reason), and the destination shows **Carried from**, each a link to the other Rock, and each expandable to the milestone pairs. Opening a Rock in another quarter switches the page to that quarter.
6. A Company Rock card has a collapsed **Individual Rocks** line (count, blocked count), loaded only when opened, with its own expand button (clicking the card still opens the details). Open, each Individual Rock shows owner, status, due date, progress, and blocked/carried/unmapped indicators; expanding one shows its milestones and which Company milestones each supports; unmapped Individual milestones and Company milestones with no Individual work behind them are called out; **Open details** opens the full Individual Rock. If the Company or an Individual Rock has been carried forward, the destination Rock and carried milestones appear in the same hierarchy. The details panel shows the same section, open by default.

## What was deliberately not done

- The Rock editor does **not** offer Blocked as a plain status (Rock or milestone), because it cannot collect a reason. An already-blocked item still shows as blocked there, and changing it to anything else closes its blocker.
- `generate_rock_outcomes` still detects roll-forward by title; switching it to the new relation is a follow-up.
- Meeting Rock review has no "Blocked" action yet; blocked Rocks appear in its counts and attention list.
- Team-level Rocks are carried by the same function but the Company view lists Individual Rocks only, as specified.
- Nothing was applied to `unicorn-qa` or production, and no data was written there beyond rolled-back test transactions.

## Verification

- **Database** (`unicorn-qa`, three rolled-back transactions; nothing persisted): blocker recorded and edited (one open row kept), blank reason refused, completed milestone and cross-tenant dependency refused, self and double dependency and unsafe link refused by constraint, second open blocker refused, blocked-without-blocker refused at commit, blocking then unblocking in one transaction allowed, resolving to complete refused, resolving restores the earlier status, a status change closes the blocker, legacy blocked rows not re-judged and given a reason later, direct table writes denied, non-staff refused. Carryover: partial carry (Company and Individual, destination parent set, Company ↔ Individual links recreated between destination milestones), completed milestone refused, duplicate refused, add-to-existing-pair works, earlier and same quarter refused, level mismatch refused, cross-tenant refused (both directions), individual into a Rock under a different Company Rock refused, source snapshot byte-identical after carrying, completed Rock refused, reason required, `rock_impact` reports `carryover` as a delete blocker, deleting a milestone keeps its provenance row, non-staff refused, non-EOS users see no rows. Then the rollback script was run inside the same transaction: both tables, all eight functions and the status row were gone and `rock_delete_blockers` was back to its earlier answers.
- **Frontend:** focused tests for every case above that is not database-only (blocker validation, dialogs, banner, edit and clear, resolve, roll-up, carry dialog and its payload, link navigation in both directions, mapping, unmapped, empty/loading/error, read-only mode, the editor refusing Blocked) plus static assertions on the migration and rollback.
- **Not verified:** a real-data browser session. The tenant-isolation suite that runs against a real database needs a service-role key and was not run here; tenant isolation was checked in the rolled-back transactions above.

## Release steps (not done)

1. Review and merge the PR (merging does not apply the migration; migrations are applied through the Supabase MCP, not CI).
2. Apply `supabase/migrations/20261028020000_rock_blockers_and_carryover.sql` to `unicorn-qa`, verify (structure, grants, function bodies), then to production, verify the same way. Rollback: `supabase/migrations/rollback/20261028020000_rock_blockers_and_carryover.down.sql` (destroys recorded blockers and carryover provenance).
3. Deploy the frontend. Until step 2 is done in an environment, the new screens there will show their "could not be loaded" states, and Mark as blocked / Carry forward will fail with the database's own error.
4. A real-data check in a browser: record and resolve a blocker, carry one Rock forward, open a Company Rock's Individual Rocks.

Related: [audit entry](../../audit-log/entries/2026-10-28-rock-blockers-and-carryover.md), [rock-task-sync.md](rock-task-sync.md) (the retired task sync).
