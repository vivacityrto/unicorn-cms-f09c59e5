# Audit: 2026-10-28 — Rock blockers, carryover and the Company → Individual view

**Trigger:** feature work (Carl's request for a richer Rock detail and carryover workflow)
**Scope:** one migration (`20261028020000_rock_blockers_and_carryover.sql`) that adds three tables, eight new functions (one more is replaced), seven triggers and a status value; the screens that use them. Design and data model: [rock-blockers-and-carryover.md](../../kb/codebase-state/rock-blockers-and-carryover.md).
**Status: built and tested; NOT applied to `unicorn-qa` or production.** The migration was run only inside transactions that were deliberately rolled back. Applying it is a separate step, listed below.

## What the migration does
- **Adds** `eos_rock_blockers`, `eos_rock_carryovers`, `eos_rock_carryover_milestones` with row level security (select only, no write grants) and `SECURITY DEFINER` functions `set_blocker`, `resolve_blocker`, `carry_forward_rock` (staff only, empty `search_path`, not callable by `anon`).
- **Adds** a `dd_rock_status` row `blocked` (a lookup row; `eos_rocks.status` has no constraint, so none changes).
- **Adds** a deferred constraint trigger on `eos_rocks` and `eos_rock_milestones` that refuses a commit leaving an item blocked without an open blocker (rows already blocked are not re-judged), and an `AFTER UPDATE OF status` trigger that closes the open blocker when the status leaves blocked.
- **Replaces** `rock_delete_blockers()` to add `carryover` (a Rock in a carryover cannot be deleted; archive it).
- **Changes no existing row.** Rocks and milestones are not modified; there is no backfill.

## Security review of the diff
- Every new function is `SECURITY DEFINER` with `SET search_path = ''`, checks `is_vivacity_team_safe(auth.uid())` first, and has `EXECUTE` revoked from `PUBLIC` and `anon`; trigger functions are revoked from everyone.
- The three tables grant `SELECT` to `authenticated` only, behind policies using the same tests as the existing Rock tables (`is_vivacity_team_user`, `has_any_eos_role`, `is_super_admin`); direct inserts were denied in test.
- Tenant isolation: composite `(id, tenant_id)` foreign keys for milestone references, plus triggers that check the tenant of both Rocks, of a blocker's dependency and of the carryover's milestones. Cross-tenant carryover and dependency were refused in test, in both directions.
- Identifiers from callers (`depends_on_*`, destination `rock_id`, milestone ids) are validated server-side (same tenant, right Rock, not completed); none is trusted as given.
- Evidence links are constrained to `http(s)://` at the table and rendered only if `http(s)`.
- No `INSERT`/`UPDATE`/`DELETE` of Rocks or milestones in `carry_forward_rock` (asserted by a test), so the source's history cannot be rewritten through it.

## Verification (unicorn-qa, `qfpxvumcrnzrjyvqkicq`; three rolled-back runs, nothing persisted)
Run 1 found a real defect in my first version: the deferred check judged the row as it was when the status changed, so a Rock blocked and unblocked inside one transaction was refused. It now re-reads the current status. Runs 2 and 3 repeated everything with the fix.
- **Blockers:** record (status and `status_before` set, one open row); edit keeps one open row; blank reason refused; completed milestone refused; cross-tenant dependency refused; self dependency, two dependencies, non-http link and a second open blocker refused by constraint; blocked without a blocker refused at commit; transient block and unblock allowed; resolve to complete refused; resolve restores the earlier status; a direct status change closes the blocker with a note; direct table insert denied; non-staff refused; legacy blocked Rock and milestone not re-judged on unrelated edits, then given a reason, and resolving falls back to on track.
- **Carryover:** Company and Individual carried (destination quarter 2027-Q1, destination parent is the carried Company Rock, two Company ↔ Individual links recreated between destination milestones, statuses copied as in progress / not started, completed milestone not copied); the new date stored apart from the original; source Rocks and milestones byte-identical (hash) before and after; source not completed; completed milestone, duplicate, completed Rock, missing reason, earlier or same quarter, level mismatch, cross-tenant (both directions), Individual into a Rock under a different or no Company Rock, a milestone from another Rock, and a destination milestone on the wrong Rock all refused; adding a milestone later to an existing pair works with one carryover row; `rock_impact` lists `carryover`; deleting a destination milestone keeps its provenance row with the title; non-staff refused; a non-EOS user sees no rows in any new table. A loop cannot be built because the later-quarter rule stops it first; the recursive check is a second line of defence, untestable on its own.
- **Rollback:** the rollback script ran inside the same transaction: no table, function or `blocked` status row left, no Rock left blocked, `rock_delete_blockers` back to its previous answers.
- **Not covered:** a browser session on real data; the repository's live tenant-isolation suite (needs a service-role key). Production was not touched at all.

## Human actions still needed
1. Review the PR. **Merging does not apply the migration** (migrations go through the Supabase MCP).
2. Apply the migration to `unicorn-qa`, verify, then production, verify (structure, grants, function bodies). Rollback file: `supabase/migrations/rollback/20261028020000_rock_blockers_and_carryover.down.sql`.
3. Deploy the frontend; until the migration is applied in an environment, the new screens there show their error states.
4. A real-data browser check (record and resolve a blocker, carry one Rock, open a Company Rock's Individual Rocks).
