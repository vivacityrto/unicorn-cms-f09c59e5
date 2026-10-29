# Audit: 2026-10-30 — Milestones link through a Team Rock

**Trigger:** feature work (Carl: can an individual Rock link to a team Rock, "like the milestones and everything"? Carl chose the full chain: Individual milestone to Team milestone to Company milestone).
**Scope:** one migration (`20261030010000_rock_milestone_links_team_chain.sql`): one function body replaced; the screens and the Rock editor that use it. Design and rules: [rock-hierarchy-and-linking.md](../../kb/codebase-state/rock-hierarchy-and-linking.md).
**Status: written and behaviourally verified on `unicorn-qa` in a rolled-back transaction (30 Oct 2026, on Carl's instruction); not applied to `unicorn-qa` or production.** Applying it is a separate instruction (see "Human actions still needed").

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
- **Database (unicorn-qa, `qfpxvumcrnzrjyvqkicq`, one rolled-back run, nothing persisted):** see "Behavioural check on unicorn-qa" below.
- **Not run:** a browser check of the screens on real data.

## Behavioural check on unicorn-qa (30 Oct 2026, Carl's instruction)
One anonymous `DO` block that ended in a deliberate `RAISE EXCEPTION`, so the fixtures, the replaced function and the links were all rolled back. QA held 0 Rocks, 0 milestones and 0 links before; fixtures were two Company Rocks, three Team Rocks (one standalone), four Individual Rocks and a Company Rock in another tenant, each with one milestone, written with triggers temporarily off (QA has no owners or functions for Team Rocks) and with triggers back on before any link was tested.
- **Current QA rule (17 pairings):** all 17 behaved as expected. Individual to Company, direct and through a Team Rock, allowed; every other pairing refused, including the three the migration adds (so the migration is genuinely needed).
- **New rule (same 17 pairings):** all 17 behaved as expected. Allowed: Individual to Company (direct, via Team), Individual to its own Team Rock (including a standalone Team Rock), Team to its own Company Rock. Refused with a message naming the rule: an Individual to a Team Rock it does not serve or an unrelated one, to another Company Rock, or under a standalone Team Rock to a Company Rock; a Team to a Company Rock that is not its parent (including a standalone Team Rock); Company to Team, Team to Team, Individual to Individual, Company to Company; a milestone from another tenant; right milestones with the wrong link tenant.
- **Existing links stay valid:** two links created under the old rule were re-validated under the new one (an `UPDATE` fires the trigger again) with no refusal. An `UPDATE` of a stored Individual-to-Team link to a milestone whose Rock does not serve that Team Rock was refused.
- **Function properties after the change:** `SECURITY DEFINER`, empty `search_path`, not executable by `anon` or `PUBLIC`, one overload.
- **After the run:** QA again held 0 Rocks, milestones and links, no `ZZ-TEST` Rock, one function overload, and the old function body.

## Checks run
30 Oct 2026, on the branch head before commit: `tsc` for the app and Node projects, 0 errors; ESLint on all 25 changed TypeScript files, 0 errors and 0 warnings; `npm run test:frontend`, 162 files passed (6 skipped by design), 1541 tests passed (43 skipped); `npm run test:edge`, passed. The package scripts for lint ratchet and typecheck could not start in this worktree (its `node_modules` holds only caches, so the scripts' relative paths to `eslint` and `tsc` fail), so the same tools were run directly from the main checkout's install with the same configuration; the ratchet's diff-scoped comparison itself was not run. Hosted CI will run the real scripts.

## Human actions still needed
1. Decide whether to apply the migration to `unicorn-qa` and then production (separate instructions; nothing has been applied). The rule was verified on QA in a rolled-back transaction only.
2. Confirm or revert the three provisional choices in the KB page (a Team-only link counts as mapped; no automatic roll-up through the chain; Team milestones are never flagged as unmapped).
3. Review and approve the PR. The frontend deploys on merge; until the migration is applied, ticking a Team milestone in the picker is refused by the database with the old message.
