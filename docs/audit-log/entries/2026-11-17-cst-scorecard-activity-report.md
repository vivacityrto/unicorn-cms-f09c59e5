# Audit: 2026-11-17 — cst-scorecard-activity-report

**Trigger:** the team asked for client logins per RTO and courses finished as part of the EOS scorecard for the CST (the primary CSCs), with a breakdown and a redesigned L10 Scorecard segment.
**Scope:** one migration (five functions, one snapshot table with RLS, one weekly job), a `scorecard-refresh` edge-function change, a CST report page, CST headline cards on the Scorecard page, and an exceptions-first L10 Scorecard segment. Definitions and decisions: [docs/kb/reference/cst-scorecard-metric-dictionary-2026-11-17.md](../../kb/reference/cst-scorecard-metric-dictionary-2026-11-17.md).
**Status:** applied to `unicorn-qa`, then to production on 17 November 2026 (version `20261117034338`, Carl's explicit go-ahead) with a read-only postflight that matched the design. The snapshot was then backfilled for 13 weeks (741 rows, Carl's go-ahead, same day), and the same day the five CST metrics (with 13 weeks of entries), the merged scorecard rows and a test L10 meeting were created (see "Production data changes" below). The `scorecard-refresh` change deployed when PR #1521 merged. Three defects in that function were found while loading the entries and are fixed by a follow-up PR (see "Defects found in `scorecard-refresh`").

## What changed

**Database (`supabase/migrations/20261117100000_cst_scorecard_activity_report.sql`, rollback in `supabase/migrations/rollback/`)**

- `cst_activity_stats(start, end)`: per Live Client RTO, client users, active users, never-signed-in users and certificates issued in a window. Internal; `service_role` only.
- `get_cst_report(period, anchor)`: the report, grouped by primary CSC with each RTO nested. Periods `week`, `month`, `year`, `days28`, with the prior period alongside. Sydney-time boundaries. **Vivacity staff only**, checked inside the function (`is_vivacity_team_safe(auth.uid())`); granted to `authenticated` and `service_role`, not `anon`.
- `cst_scorecard_weekly_snapshot`: one row per Live RTO per week (Sunday week ending). RLS on; staff SELECT policy only; every client write privilege revoked (new public tables otherwise carry default grants to `authenticated`).
- `snapshot_cst_week(date)`, `backfill_cst_snapshots(integer)`: write the snapshot. `service_role` only. Refuse a date that is not a Sunday or has not ended.
- `get_cst_team_metric(key, week_ending)`: team value for five metric keys, read from the snapshot. `service_role` only. Returns null for an unknown key or a week with no snapshot.
- Weekly `pg_cron` job (Sunday 16:30 UTC, Monday 03:30 Sydney), created only where `pg_cron` exists. It is not installed on `unicorn-qa`.
- All functions are `SECURITY DEFINER` with `SET search_path TO ''`, schema-qualified, `REVOKE ALL … FROM PUBLIC`.

**Definitions that matter**

- Live Clients mirror Manage Tenants: status Active, On hold, In Arears or Warning, not archived, RTO accounts only.
- Client activity: portal page views, `client_login`, `message_sent`, `message_read`, `academy_lesson_completed`, and `academy_enrolled` **only where `metadata.source` is `self_enrol`**. **This narrows the list Carl approved on 17 November 2026.** In the last 180 days, 382 of 626 enrolment events were `auto_package` or `auto_all_clients`: the system enrolled the learner and attributed the event to them, so counting them would report activity nobody did. `staff_impersonation` and `manual` are excluded for the same reason. Staff actions and staff-shared documents never count because only actors who are client users of that RTO are kept.
- Client user: `tenant_users` row, profile not Vivacity internal, not archived.
- Courses finished: a certificate issued (`academy_certificates.issued_at`, not revoked).

**Edge function:** `scorecard-refresh` resolves five new `cst_*` metric keys through `get_cst_team_metric`. A week with no snapshot is skipped, not recorded as zero.

**Frontend:** `/eos/cst-report` (Week, Month, Year, Last 28 days; primary CSC rows that expand to RTOs; CSV export with formula neutralising; Vivacity team route); four CST headline cards on the Scorecard page; five CST metric templates; the L10 Scorecard segment now lists every active metric with the worst first (off track, at risk, out of date, no data) and keeps on-track metrics closed. The configured `scorecard_metric_cap` (5 on all four types for tenant 6372) now sets how many to-discuss metrics start expanded instead of hiding the rest. Live entry and the existing Add to Issues action are unchanged because the segment still renders `ScorecardEntryGrid` for each expanded metric.

## Evidence

**`unicorn-qa` (17 November 2026, project confirmed before each write).** Migration applied through the Supabase MCP, plus a follow-up revoke for the table grant described below.

- **Access:** with no identity, `get_cst_report` raises 42501 (Not authorized). With a client user's identity, also 42501. With a Vivacity internal user's identity, all four periods return. `anon` cannot execute the report or select the table; `authenticated` cannot execute any of the other four functions.
- **Grant defect found and fixed:** the first apply left `INSERT` on the snapshot table granted to `authenticated` by the schema's default privileges. RLS had no write policy so it was not exploitable, but the migration now revokes it and a second QA migration applied the same change. Re-check: `authenticated` has SELECT only.
- **Behaviour:** QA has 5 Live RTOs and 19 client users. A year window gave 8 active users across 4 RTOs, matching an independent query. The report returned 2 CSC groups. `backfill_cst_snapshots(4)` wrote 20 rows (5 RTOs × 4 weeks), all Sunday week endings, latest the last fully ended Sunday. `get_cst_team_metric` returned values for the five keys and null for an unknown key and for a week with no snapshot. `snapshot_cst_week` refused a non-Sunday and a Sunday that has not ended.
- **Not proven on QA:** a week with real recent activity (QA data is old), the `pg_cron` job (not installed), and certificates (QA has none).

**Production, read-only (select only, nothing written), 17 November 2026.** The same logic gave 57 Live RTOs, 55 with users, 191 client users, **38 active in 28 days (20%)**, 21 RTOs with activity, 34 without, 30 never signed in. Certificates issued: 1 this week (4 last week), 5 this month (15 last month), 61 this year (none before 2026). These are the figures after the self-enrolment narrowing; the earlier 43 users (23%) included automatic enrolments.

**Repository checks:** `npm run typecheck`, `lint:ratchet`, `test:frontend`, `test:edge`, `check-kb-links` and the migration safety audit; results are in the PR description.

## Known limits

- History: membership and Live status are the current ones, so a past week is the current client base measured over that week. Page views exist only since 4 August 2026, so activity before then rests on timeline events alone. In the backfill this means the weeks ending 23 and 30 August have part of their 28-day window before 4 August and are likely understated. It also means "users never signed in" reads 30 in every backfilled week, because it is a point-in-time count taken on 17 November, not a history.
- Certificate counts are small (1 to 4 a week). Month is the useful view.
- Per-RTO rows are not shown on the Scorecard page, only on the report.
- The 9 per-consultant copies of CHC, Validation and Projects On Track were not merged by the code change; they were merged afterwards as a production data change (see "Production data changes").
- Existing automatic metrics (CHC, validation, Active ComplyHub Users) still have no resolver and remain empty; this change only adds the CST keys.

## Production

All five steps were done on 17 November 2026, each on Carl's explicit go-ahead.

1. **Done.** Target confirmed as production ref `yxkgdalkbrriasiyyrwk` (the `postgres` database; the same ref as `supabase/config.toml` and the migration's target marker). Preflight, read-only: none of the five functions, the table or the cron job existed; `pg_cron` was installed; `is_vivacity_team_safe` existed; 57 Live RTOs.
2. **Done.** `20261117100000_cst_scorecard_activity_report.sql` applied through the Supabase MCP (`apply_migration`), text identical to the file on `main`. Recorded as `20261117034338 cst_scorecard_activity_report`.
3. **Done.** Postflight, read-only:
   - Each of the five functions exists exactly once, all `SECURITY DEFINER` with an empty `search_path`.
   - `anon` cannot execute `get_cst_report` or select the table; `authenticated` can execute only `get_cst_report`, and cannot execute the other four functions.
   - RLS is on; the one policy is `cst_snapshot_staff_read` (SELECT); `authenticated` has SELECT only on the snapshot table (no insert, update or delete).
   - The cron job is listed and active: `30 16 * * 0`, `select public.snapshot_cst_week();`. The first run is Sunday 22 November 2026, 16:30 UTC (Monday 23 November, 03:30 Sydney).
   - `cst_activity_stats` over the last 28 days returned 191 client users, 38 active, 21 RTOs active, 30 never signed in: the same figures measured before the migration existed.
   - `get_cst_report` with no identity raises 42501. Called as a Vivacity Super Admin it returned 8 groups (7 primary CSCs plus unassigned) for all four periods. Week: 11 active users, 1 certificate (4 prior). Month: 25 active users, 5 certificates (15 prior). Year: 89 active users, 61 certificates, no prior year. Last 28 days: 38 active users, 21 RTOs active, 12 certificates (15 prior).
   - The snapshot table held 0 rows at that point.
4. **Done.** `select public.backfill_cst_snapshots(13)` run once on production (Carl's explicit go-ahead; run as the database owner, not through the app). It writes the snapshot table only. Pre-check: 0 rows, 57 Live RTOs, last ended Sunday 15 November 2026. Result: **741 rows written (57 RTOs × 13 weeks)**; read back afterwards: 741 rows, 13 weeks from 23 August to 15 November 2026, every week ending on a Sunday, exactly 57 rows in every week, no invalid rows (active users never exceed client users). `get_cst_team_metric` now returns a value for all five keys in each of the 13 weeks. Week ending 15 November: client activity rate 18.8%, RTOs with activity 34.5%, certificates 4, never signed in 30, RTOs with no activity 36. Week ending 20 September to 25 October: activity rate 19.9% to 26.2%. The weekly job adds the week ending 22 November on the night of 22 to 23 November.
5. **Done, by direct SQL rather than the Add Metric screen and `scorecard-refresh`.** The function cannot be called without the cron secret, and loading the entries showed it could not have written them anyway (see below). Details in the next section.

## Production data changes (17 November 2026, tenant 6372)

Each block ran atomically with assertions on the row counts it expected, so it applied fully or not at all. Targets are the placeholders from the metric templates; the CST should set the real ones from the Scorecard page.

- **Five CST metrics created** (category `CST`, automatic, weekly, owner Angela Connell-Richards as chosen by Carl): client activity rate % (target 50), RTOs with client activity % (60), certificates issued (3 a week), users never signed in (15 or fewer), Live RTOs with no activity (20 or fewer). `created_by` was left empty rather than attributing the rows to a person.
- **Nine per-consultant rows merged into three.** One row of each trio (CHC, Validation, Projects On Track) was kept, renamed without the consultant's name and given the single owner; the other six were archived, not deleted (all nine had zero entries, so no data was affected, and archiving is reversible). This also removes the three rows owned by Samantha Holtham, whose account is disabled. Active company metrics: 17 became 11, plus the 5 CST metrics (16 active).
- **65 entries loaded** (5 metrics × the 13 backfilled weeks), values from `get_cst_team_metric`, status by the same rule as the app (10% amber band), `entry_source = 'system'`. They are keyed by the **Monday** that starts each week, matching all 98 existing manual entries and the L10 grid. `entered_by` is Carl Simpao's account because the column is a required foreign key to a real user and no scorecard system account exists; the note reads "Loaded from CST weekly snapshot". The latest week (starting 9 November) reads: activity rate 18.8% (red), RTOs with activity 34.5% (red), certificates 4 (green), never signed in 30 (red), RTOs with no activity 36 (red). The 98 manual entries are unchanged.
- **Test L10 meeting created:** "TEST L10: CST scorecard (not a real meeting)", id `577cf8ee-562f-4417-8402-864ae844595c`, status scheduled, through the app's own `create_meeting_from_template` with the default Level 10 agenda (7 segments, Scorecard second), not linked to a series so closing it cannot generate a next meeting. Carl Simpao is the Leader and the Carl (Reviewer) account a member. The creation function and an insert trigger add the whole roster; those other participant and attendee rows were removed immediately, so only the two Carl accounts remain and no notification was created. It can be deleted from Meetings when no longer needed.
- **Not changed, and flagged:** two other active metrics are owned by people whose accounts are archived and disabled (Website to Free Trial Conversion %, Event paid attendees). Carl only asked about Samantha, so they were left as they are.

## Defects found in `scorecard-refresh`

Found while loading the entries; fixed in the follow-up pull request, not by this change:

1. It wrote `entered_by` as a placeholder all-zero id when no actor was passed. `entered_by` is a required foreign key to `auth.users` and that id is not a user, so the insert fails, and the function never checked the result, so it would report success while writing nothing.
2. It keyed weeks by Sunday, while every manual entry and the L10 grid use the Monday, so a refresh would have created a second entry beside each loaded one.
3. Its default week was the upcoming Sunday, not the last completed week.

The fix checks every write, requires a real user (`actor_user_id`, or the `SCORECARD_REFRESH_ACTOR_USER_ID` setting), keys weeks by Monday with the default being the last completed week in Sydney time, and maps a Monday key to the snapshot's Sunday. Nothing calls the function on a schedule yet, so the weekly entries are not automatic until a caller and that setting exist.

**Rollback:** `supabase/migrations/rollback/20261117100000_cst_scorecard_activity_report.down.sql` drops everything the migration added. No existing object was altered, and the snapshot is derived data that can be rebuilt.
