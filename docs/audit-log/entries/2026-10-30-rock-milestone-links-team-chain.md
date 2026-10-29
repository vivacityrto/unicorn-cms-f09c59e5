# Audit: 2026-10-30 — Milestones link through a Team Rock

**Trigger:** feature work (Carl: can an individual Rock link to a team Rock, "like the milestones and everything"? Carl chose the full chain: Individual milestone to Team milestone to Company milestone).
**Scope:** one migration (`20261030010000_rock_milestone_links_team_chain.sql`): one function body replaced; the screens and the Rock editor that use it. Design and rules: [rock-hierarchy-and-linking.md](../../kb/codebase-state/rock-hierarchy-and-linking.md).
**Status: written, not applied to `unicorn-qa` or production.** Applying it needs Carl's go-ahead (see "Human actions still needed").

## What the migration does
- **Replaces** the body of `validate_eos_rock_milestone_link()` (the `BEFORE INSERT OR UPDATE` trigger on `eos_rock_milestone_links`). Allowed pairings, supported milestone first: Company ← Individual (the Individual Rock serves that Company Rock directly or through a Team Rock that serves it, **unchanged**), Team ← Individual (the Individual Rock serves that Team Rock), Company ← Team (the Team Rock serves that Company Rock). Anything else is refused with a message naming the rule.
- **Keeps** the function `SECURITY DEFINER`, empty `search_path`, `REVOKE ALL ... FROM PUBLIC, anon`, and the tenant checks on both milestones and both Rocks.
- **Changes no table, column, policy, grant or row.** The links table keeps its column names (`company_milestone_id` is the milestone being supported). Every existing link is an Individual-to-Company link and stays valid.
- Rollback: `supabase/migrations/rollback/20261030010000_rock_milestone_links_team_chain.down.sql` restores the original function and first deletes any link with a Team Rock milestone at either end (the restored rule would refuse them).

## Why the editor change belongs in the same PR
`useSaveRock` deletes every link of an Individual milestone that the form does not list, and the form's validation rejected any supported milestone outside the Company Rock. Without the editor change, saving an Individual Rock would have deleted (or refused) any Team link made from the picker. The editor now loads the Team and Company milestones above the Rock, validates against both, and syncs links for Team Rocks too.

## Security review of the diff
- The only database change is a stricter-or-equal-in-scope validation trigger: it adds two allowed pairings, each requiring the lower Rock to be the direct child of the upper Rock (Individual to Company also allows the grandchild route that already existed). All Rock and milestone lookups are scoped to the link's tenant.
- Who may write links is unchanged: the existing row level security policies (Vivacity team users, holders of an EOS role in the tenant, super admins). The trigger is validation, not authorisation.
- **Pre-existing, not changed here:** `anon` holds table-wide privileges on `eos_rock_milestone_links` with no policy for `anon`, so calls are refused by row level security; the grants are wider than needed (noted in the 28 Oct entry). Worth a separate tightening migration.
- Not reviewed by a security-diff-scan tool (not available in this session); a human reviewer should read the one function.

## Verification so far
- **Frontend:** unit and component tests for the link-target rules, the picker (grouped Team and Company milestones, both ticked at once), the Individual Rocks view (Team support shown, Team-or-Company button, picker targets), the Rock details (a Team Rock links up; an Individual Rock under a standalone Team Rock links to it instead of hitting a dead end), the contribution model, the editor rules and the editor data hook; a static test of the migration and its rollback.
- **Checks:** see "Checks run" below.
- **Not run:** the behavioural run of the trigger against a database (every allowed and refused pairing, existing links staying valid, in a rolled-back transaction on `unicorn-qa`); a browser check of the screens on real data.

## Checks run
30 Oct 2026, on the branch head before commit: `tsc` for the app and Node projects, 0 errors; ESLint on all 25 changed TypeScript files, 0 errors and 0 warnings; `npm run test:frontend`, 162 files passed (6 skipped by design), 1541 tests passed (43 skipped); `npm run test:edge`, passed. The package scripts for lint ratchet and typecheck could not start in this worktree (its `node_modules` holds only caches, so the scripts' relative paths to `eslint` and `tsc` fail), so the same tools were run directly from the main checkout's install with the same configuration; the ratchet's diff-scoped comparison itself was not run. Hosted CI will run the real scripts.

## Human actions still needed
1. Decide whether I may run the trigger's behavioural check on `unicorn-qa` in a rolled-back transaction, and then apply the migration to QA and production (both are separate instructions; nothing has been applied).
2. Confirm or revert the three provisional choices in the KB page (a Team-only link counts as mapped; no automatic roll-up through the chain; Team milestones are never flagged as unmapped).
3. Review and approve the PR. The frontend deploys on merge; until the migration is applied, ticking a Team milestone in the picker is refused by the database with the old message.
