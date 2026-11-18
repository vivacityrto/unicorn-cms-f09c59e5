# Audit: 2026-11-18 — scorecard-plain-redesign

**Trigger:** Carl found the Scorecard page and the CST report confusing for non-technical people and asked for a redesign, plus an L10 Scorecard segment built like the Rocks segment (discuss per area, notes, raise to IDS, presentation style). Direction approved on 18 November 2026.
**Scope:** one migration (a notes table with RLS, an issue link column, a helper function, an in-place replacement of `get_cst_report`), plus front-end only: the Scorecard page, the CST report and the L10 Scorecard segment, rewritten.
**Status:** migration `20261118100000_scorecard_discussion.sql` applied to `unicorn-qa` only. **Not applied to production.** Until it is, the L10 deck cannot save notes or link issues to a measure, and the CST report hides its "Last active" line (the front end shows it only when the report carries `last_active_at`). The Scorecard page works without it. Applying it needs Carl's explicit go-ahead.

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
- Renaming the metrics to plain names and rewriting their descriptions is a production data change that has not been made; it waits for the PR and migration to land.

## Production

Pending. Before applying: confirm project `yxkgdalkbrriasiyyrwk`, confirm the notes table and the issue column do not already exist, and confirm `get_cst_report` exists exactly once. After: the function exists once, `authenticated` has only select, insert, update and delete on the notes table, `anon` has none, and a staff-identity call to `get_cst_report` returns `last_active_at`.
