# Audit: 2026-11-18 — scorecard-plain-redesign

**Trigger:** Carl found the Scorecard page and the CST report confusing for non-technical people and asked for a redesign, plus an L10 Scorecard segment built like the Rocks segment (discuss per area, notes, raise to IDS, presentation style). Direction approved on 18 November 2026.
**Scope:** one migration (a notes table with RLS, an issue link column, a helper function, an in-place replacement of `get_cst_report`), plus front-end only: the Scorecard page, the CST report and the L10 Scorecard segment, rewritten.
**Status:** merged in PR 1539 (commit `0632dd0`). Migration `20261118100000_scorecard_discussion.sql` applied to `unicorn-qa`, then to production on 18 November 2026 on Carl's explicit go-ahead, with a read-only postflight that matched the design (see "Production").

## What changed

**Database (`supabase/migrations/20261118100000_scorecard_discussion.sql`, rollback in `supabase/migrations/rollback/`)**

- `eos_scorecard_discussion_notes`: one note per person per area per meeting (unique on meeting, category, author), body 1 to 5,000 characters, `updated_at` trigger. RLS on. Select: Vivacity staff. Insert: staff, the author must be the caller, and the tenant must equal the meeting's tenant. Update: own rows. Delete: own rows or a Super Admin. Default grants to `anon`, `authenticated` and `PUBLIC` are revoked first, then only select, insert, update and delete are granted to `authenticated`.
- `eos_issues.linked_scorecard_metric_id`: foreign key to `eos_scorecard_metrics`, `ON DELETE SET NULL` (deleting a metric keeps the issue), with a partial index.
- `cst_last_activity()`: latest client activity per Live RTO. Internal staff and `service_role` only.
- `get_cst_report(text, date)`: replaced in place (same signature, so no second overload); each RTO now also carries `last_active_at`. Still staff only, checked inside the function.
- All new functions are `SECURITY DEFINER` with `SET search_path TO ''`, schema-qualified, `REVOKE ALL … FROM PUBLIC`.
- Rollback drops the table, the column and the index. It deliberately keeps `cst_last_activity` and the new `get_cst_report`, because the new report calls the function.

**Front end**

- Scorecard page: plain-language headline, needs-attention cards, a list of numbers still to enter, areas closed by default. Status is always a word plus a symbol, never colour alone.
- CST report: headline, three key numbers, by-CSC list in words, definitions in a collapsible panel.
- L10 segment: area cards and a full-screen discussion deck with notes and raise-to-IDS, mirroring Rock Review. The issue is written to `eos_issues` with the same columns IDS writes, plus the measure link.
- Removed as unused: `NeedsAttention`, `CompanyScorecardTable`, `MissingDataPanel`, `MetricRow`, `TrendSparkline`, `StatusBadge`, `MetricDetailDrawer`, `CstSignalCards`, and the exceptions-first helpers `scorecardReview.ts` with their tests. `MetricEditorDialogV2` and `ScorecardEntryGrid` are kept.
- `useScorecardDiscussion.ts` reaches the new table and column through a small hand-typed query interface (typed results, string column names) until the generated types are refreshed after the production apply; swap it for the generated client then.

## Evidence

**`unicorn-qa` (18 November 2026), rolled-back blocks under real roles.** QA has no lookup seeds for meeting type, status or issue status, so each test inserted them inside the rolled-back transaction.

- A staff user can write a note; a second note by the same person for the same area and meeting is refused; a wrong tenant, a forged author and a blank body are refused; a client user and `anon` are blocked from reading and writing.
- An issue links to a metric; deleting the metric clears the link and keeps the issue.
- `get_cst_report` returns `last_active_at` for every RTO.
- QA was left unchanged by these tests.

**Repository checks:** `npm run typecheck` clean; `lint:ratchet` no regressions; ESLint on the new files clean; `test:frontend` 1,753 passed, 43 skipped, 0 failed; new tests cover the deck logic, the new CST helpers and the segment (open deck, raise an issue linked to the measure and meeting, save a note, wrap-up, record a missing number).

**Not verified:** no live browser pass. The app talks to production Supabase and the new table does not exist there yet, so the deck's notes and issue link cannot be exercised end to end until the migration is applied.

## Known limits

- The `scorecard_metric_cap` configuration no longer changes the segment. The setting is still in the configuration editor and is now unused.
- `ScorecardEntryGrid` has no remaining callers and can be retired separately.
- Two renames rest on a reading of the old text, not a confirmed answer: "Clarity Calls held" (the old description said calls booked; the key is still `discovery_calls_booked_count`) and "New clients signed" (the old description said invoice sent). Revert either if the team counts the other thing.

## Production

Applied on 18 November 2026 through the Supabase MCP (`apply_migration`, name `scorecard_discussion`), text identical to the file merged to `main`, on Carl's explicit go-ahead.

1. **Target:** `yxkgdalkbrriasiyyrwk` (the ref in `supabase/config.toml` and the migration's target marker).
2. **Preflight, read-only:** the notes table, the issue column and `cst_last_activity` did not exist; `get_cst_report` existed once; `is_vivacity_team_safe`, `is_super_admin` and `update_updated_at_column` existed; 57 Live RTOs; no migration with a 20261118 version was recorded.
3. **Postflight, read-only:**
   - `get_cst_report` and `cst_last_activity` each exist exactly once, both `SECURITY DEFINER` with an empty `search_path`.
   - RLS is on for the notes table with four policies (select, insert, update, delete); `authenticated` holds only select, insert, update and delete; `anon` and `PUBLIC` hold nothing.
   - `eos_issues.linked_scorecard_metric_id` exists.
   - `anon` cannot execute `get_cst_report`; `authenticated` can. Neither `anon` nor `authenticated` can execute `cst_last_activity`.
   - `cst_last_activity()` returns activity for 33 RTOs; the notes table is empty.
4. **Not checked in production:** a staff-identity call to `get_cst_report` and a real note or issue write, because those need a signed-in session. The same checks passed on `unicorn-qa` under real roles.

**Rollback:** `supabase/migrations/rollback/20261118100000_scorecard_discussion.down.sql` drops the table, column and index and keeps `cst_last_activity` and the new `get_cst_report`.

## Production data change: plain metric names (18 November 2026)

On Carl's explicit go-ahead, after the list was shown, the 14 active measures on tenant 6372 had their name and description rewritten in one `UPDATE` by id (14 rows, expected 14). Keys, targets, units, directions, owners, sources and entries were not touched, so `scorecard-refresh` (which finds measures by key) is unaffected. Read-back confirmed all 14 keys, targets and owners unchanged.

| Old name | New name |
|---|---|
| CST: Client activity rate % | People using the portal |
| CST: RTOs with client activity % | Clients using the portal |
| CST: Certificates issued | Certificates issued |
| CST: Users never signed in | Users who never signed in |
| CST: Live RTOs with no activity | Quiet RTOs |
| Clients with Current CHC % | Clients with a current CHC |
| Clients with Current Validation % | Clients with a current validation |
| Projects On Track % | Projects on track |
| Active ComplyHub Users % | ComplyHub subscribers using it |
| Qualified Leads | Qualified leads |
| Proposals Sent | Proposals sent |
| New Revenue Booked | New revenue booked (ex-GST added to the description) |
| Clarity Calls Completed | Clarity Calls held |
| New Clients Signed | New clients signed |

**Targets as stored after this change:** People using the portal 30%; Clients using the portal 50%; Certificates issued 3; Users who never signed in 20 or fewer; Quiet RTOs 30 or fewer.

**Revert:** the old names are in the table above; the old descriptions are in the preceding read in the session transcript (for example the three merged measures read "Company-wide measure across all clients. Replaces the three per-consultant copies, merged 17 November 2026.").
