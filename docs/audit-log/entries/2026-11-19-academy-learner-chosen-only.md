# Audit: 2026-11-19 — academy-learner-chosen-only

**Trigger:** Carl said courses added automatically were polluting the Academy numbers ("Added automatically 825"), that the only data that matters is courses learners chose themselves, and asked for an investigation, a council review, and for anything contradicting that purpose to be reverted if safe. He then approved the metric fix plus cleaning the internal tenants ("Also clean internal").
**Scope:** the Academy figures in the Client activity report and the scorecard Full Report now count only learner-chosen enrolments; one data clean-up in two internal tenants (migration `20261119120000_academy_remove_untouched_legacy_package_enrolments_internal.sql`).
**Status:** merged in PR 1552 (commit `ddb0072`). Migration applied to production on 19 November 2026 on Carl's explicit go-ahead ("Merge, then apply"). Postflight below.

## What was found (read-only, production)

| Source | Rows | Notes |
|---|---|---|
| `self_enrol` | 330 | Learner chose it. 159 finished. This is the data that counts. |
| `auto_package` | 792 | Old package-assignment trigger, created 9 June to 10 September 2026. 787 have no lesson progress, none finished, no certificate, no PDP evidence. 431 in Vivacity's own tenant, 295 Australian College, 49 AHMRC, 13 Demo RTO, 4 MCC Adelaide. |
| `auto_all_clients` | 33 | "Mandatory for all clients" feature, 7 to 13 August. 21 finished, 12 in progress with real lesson progress. |
| `staff_impersonation` | 14 | Staff acting as a learner. |

- The core CST metrics in the database already count only `self_enrol` enrolment events. The pollution was only in the Academy section added on 18 November, which counted every source (825 = 792 + 33 "added automatically").
- Package auto-enrol was already replaced on 24 September 2026 (`20260924031412`): assigning a package now grants a tenant-level entitlement and the real enrolment starts when the learner presses Start. So the 792 are leftovers, not something still being produced.
- `enrol_in_academy_course()` returns an existing row unchanged, so a learner pressing Start on a legacy automatic row never records their choice. Soft-revoking would also bring the problem back: a revoked row is reactivated without changing its source.
- Lesson completions in the last 90 days: 643 on self-chosen enrolments, 4 on automatic ones (0.6%). The "lessons" figure on the client page was left as is.
- A dead trigger `trg_auto_enrol_academy` on `client_packages` (0 rows) would write the unrecognised source `package_auto` if it ever fired. Not changed here.

## What changed

1. **Code, no schema change.** `buildAcademyActivity` keeps only `source = 'self_enrol'` (an allowlist, so any new or unknown source is excluded by default) for enrolments, finished courses, busiest courses, stalled courses and "clients using the Academy". It reports how many enrolments and completions were left out so the screen can say so in one line. The "Chosen / Added automatically / Added another way" split is gone.
2. **Data, internal tenants only.** The migration backs up and deletes the untouched legacy `auto_package` rows in tenant 6372 (Vivacity Coaching & Consulting, 431) and tenant 7547 (Demo RTO, 13): 440 deleted, 4 with lesson progress kept. It requires status active, not revoked, not completed, and no lesson progress, assessment attempt, certificate or PDP evidence. It raises and changes nothing if the live count is not 440. Real client tenants, `auto_all_clients`, `self_enrol` and `staff_impersonation` are untouched.

## Council review (four independent read-only reviews)

- **Data integrity:** nothing fires on delete; foreign keys to certificates and PDP evidence are clear for these rows; lesson progress and attempts cascade, which is why the rows with progress are kept; 344 timeline events point at the legacy rows with no foreign key, so they would be orphaned.
- **Metrics:** use an allowlist on `source`; current month and last 28 days already show zero automatic enrolments, so the pollution only affected Year and all-time views.
- **Product:** the mandatory feature is a different intent (compliance duty), so keep it and keep it out of the "chosen" numbers; clean the internal tenants first as a canary; brief CSCs before touching real clients.
- **Red team:** deleting rows and adding tenant-wide entitlements is not needed to fix the metric, and lesson access requires an enrolment row, so removing rows from real clients would leave learners seeing a course they cannot open until they press Start again. Verdict: metric-only for clients. Adopted: no entitlement backfill, no change to real client tenants.

## Dry run

Run on production inside a block that raised at the end, so it rolled back: 440 backed up, 440 deleted, 4 left with progress, `self_enrol` 330, `auto_all_clients` 33 and `staff_impersonation` 14 unchanged, all 440 restored by the rollback statement, `auto_package` back to 792 and no leftover table.

## Production

Applied with the exact merged SQL after a clean preflight (440 eligible, backup table absent, migration not recorded). Postflight: `auto_package` 792 to 352 (4 internal rows with progress and 348 in real client tenants), `self_enrol` 330, `auto_all_clients` 33 and `staff_impersonation` 14 unchanged; the backup table holds 440 rows with none still in `academy_enrollments`; it has row security on and no grants for `anon` or `authenticated`; certificates (66) and PDP evidence (228) unchanged.

## Known limits and follow-ups

- The 348 legacy rows in real client tenants (Australian College, AHMRC, MCC Adelaide) stay. They are excluded from the Academy numbers; removing them needs a decision on lesson access and a CSC briefing.
- 344 `academy_enrolled` timeline events for the removed rows stay as history; the metrics already ignore them.
- The dead trigger and function `auto_enrol_academy_on_package_assign` are not dropped here.
- The client-facing `AcademyActivityDashboard` reads enrolments separately and was not changed.
- The backup table `_bak_academy_enrollments_legacy_auto_20261119` is kept (no access for `anon` or `authenticated`) until the clean-up is signed off.

**Rollback:** `supabase/migrations/rollback/20261119120000_academy_remove_untouched_legacy_package_enrolments_internal.down.sql` re-inserts the 440 rows with their original ids from the backup table, skipping any learner who has since enrolled in the same course.
