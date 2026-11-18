# CST scorecard metric dictionary (17 November 2026)

> **Last updated:** 2026-11-17 · **Reconsider by:** 2027-02-17 · **Confidence:** high for the definitions and the measured figures (queried read-only on production, 17 November 2026); the data layer is applied to `unicorn-qa` and to production (17 November 2026), with the snapshot backfilled for 13 weeks, the five CST metrics created and loaded, and the per-consultant rows merged; targets are placeholders.
>
> Definitions for the CST team scorecard and the matching changes to the EOS Scorecard page and the L10 Scorecard segment. The L10 Segue segment is out of scope. Standalone feature work, not one of the four tracked initiatives. The EOS module is Vivacity-internal; this reads client data but is only shown to Vivacity staff. Evidence, QA results, production steps and rollback: [audit entry](../../audit-log/entries/2026-11-17-cst-scorecard-activity-report.md).

## Terms

| Term | Meaning here | Source of truth |
|---|---|---|
| **CST** | The primary CSCs: one primary assignment per RTO that has not ended. | `tenant_csc_assignments` where `is_primary` and `ended_at` is null (the lookup Manage Tenants uses) |
| **Live Clients** | RTOs with status Active, On hold, In Arears or Warning, lifecycle status active, not archived, RTO accounts only (tenant metadata has no `academy_solo`). 57 RTOs on 17 November 2026 under the earlier rule; 53 on 18 November 2026 once lifecycle active is required (the four dropped are suspended or closed). | Manage Tenants `LIVE_STATUSES` and its default "Live" filter, plus the lifecycle condition the CSC load chips already use. The Manage Tenants "Live" filter alone still counts suspended and closed clients |
| **Client user** | A `tenant_users` row of a Live RTO whose profile is not `is_vivacity_internal` and not archived. 191 users on 17 November 2026, against 215 raw rows (18 are Vivacity staff). | `tenant_users` joined to `users` |
| **Client activity** | Any of these by a client user of that RTO: a portal page view, a `client_login` timeline event, a message sent or read, an Academy lesson completed, or an Academy enrolment the learner made themselves (`metadata.source` is `self_enrol`). List approved by Carl on 17 November 2026, then narrowed on the enrolment item (next row). | `client_portal_page_views`, `client_timeline_events` |
| **Enrolments that do not count** | `auto_package` and `auto_all_clients` (the system enrolled the learner: 382 of 626 enrolment events in the last 180 days), `staff_impersonation` and `manual`. They are recorded against the learner but are not something the client did, so counting them would report activity nobody performed. | `client_timeline_events.metadata.source` |
| **Not client activity** | Vivacity staff actions (including viewing a client's portal), `document_shared_to_client` (staff pushing a document, 14,080 of the 90-day events), system events (invoices, status changes), archived users. | Excluded by the actor filter above |
| **Course finished** | A certificate is issued, not an enrolment marked completed. | `academy_certificates.issued_at`, `revoked_at` null |

**CST terminology conflict.** [`kpi-module.md`](../codebase-state/kpi-module.md) uses "CST Assistants" for a different staff group. In this document CST means the primary CSCs, as directed on 17 November 2026. Resolve before either is shown in the same screen.

## Metrics

All five are automatic. Owner is each primary CSC for their own RTOs; the scorecard row shows the team total and the split sits behind it. Targets are proposals for the CST to set, not agreed values.

| Metric | Definition | Direction | Proposed target | Measured 17 Nov 2026 |
|---|---|---|---|---|
| Client activity rate % | Client users with client activity in the last 28 days ÷ client users | Higher | 50% | 38 of 191 (20%) |
| RTOs with client activity % | Live RTOs with at least one active client user ÷ Live RTOs that have client users | Higher | 60% | 21 of 55 (38%) |
| Certificates issued | Certificates issued in the period (week, month or year), with the prior period beside it. On the weekly scorecard it is the week's count. | Higher | 12 a month, 3 a week | 1 this week (4 last week), 5 in November to date (15 in October), 61 in 2026 (8 RTOs) |
| Users never signed in | Client users whose profile has no sign-in | Lower | 15 or fewer | 30 of 191 |
| Live RTOs with no activity (28 days) | Live RTOs with client users and no active client user | Lower | 20 or fewer | 34 of 55 |

Notes:

- The 28-day window is rolling. Week and Month views of the report use calendar periods and report distinct active users in that period.
- Weekly certificate counts are very small (1 this week, 3 last week), so the report defaults to Month.
- Year views of certificates are complete. Year views of activity can only rely on timeline events: portal page views start on 4 August 2026.
- A login-based count (13 of 58 active-status RTOs with a login in 28 days, from the auth audit log) understated engagement because sessions persist; activity gives 21 of 55.
- The "lessons finished, assessment not passed" figure (113 enrolments on 17 November 2026) is not a headline metric. It is a possible drill-down column for CSC follow-up.

### Reference query shape (measured)

For each Live RTO: take the client users above; take distinct `(tenant_id, user_id)` from page views in the window plus distinct `(tenant_id, created_by)` from timeline events of type `client_login`, `message_sent`, `message_read` or `academy_lesson_completed`, or `academy_enrolled` where `metadata.source` is `self_enrol`, in the window; keep only pairs that match a client user. Implemented as `cst_activity_stats(start, end)`. Actors that are not client users are discarded, which removes staff page views and staff actions.

## User reconciliation (data-quality flags)

- Manage Tenants' member count is every `tenant_users` row, including Vivacity staff and archived users. It is not the denominator.
- `tenant_members` (used by the Academy staff-stats RPC) disagrees with `tenant_users`: 13 rows only in `tenant_members`, 5 only in `tenant_users`, across Live RTOs. Treat as a flag for the CST, not a silent correction.
- `user_activity.tenant_id` is null on all 1,690 rows, so that table cannot give per-RTO activity.
- Manage Tenants' CSC load chips use `lifecycle_status = 'active'`, not the earlier Live definition. **Decided 18 November 2026:** the scorecard and CST report now require lifecycle active too (53 RTOs), matching the chips. The Manage Tenants "Live" filter is unchanged. Absolute Medical Response has status Active but lifecycle closed, which looks like a stale record to check.

## Data design (built; applied to `unicorn-qa` and production)

- `get_cst_report(period, anchor)` computes any period live (week, month, year, last 28 days, each with its prior period). Staff only.
- `cst_scorecard_weekly_snapshot`: one row per Live RTO per week (Sunday week ending, Sydney time) holding the CSC as at that week, client users, users active in the 28 days to week end, never-signed-in users and certificates issued that week. Written by `snapshot_cst_week` (weekly `pg_cron` job, Monday 03:30 Sydney) and `backfill_cst_snapshots`. Staff read only.
- `get_cst_team_metric(key, week_ending)` feeds `scorecard-refresh` for five keys: `cst_client_activity_rate_pct`, `cst_rtos_with_activity_pct`, `cst_certificates_issued_count`, `cst_users_never_signed_in_count`, `cst_rtos_no_activity_count`.
- Past weeks use the current user base and current Live status because neither history is stored.
- Applied to production on 17 November 2026 and verified read-only. The snapshot was backfilled the same day for the 13 weeks to 15 November 2026 (741 rows; the first two weeks are likely understated because page views start on 4 August). The five CST metrics were then created on tenant 6372 (owner Angela Connell-Richards, placeholder targets) and loaded with 13 weeks of entries keyed by the Monday that starts each week, the same convention as every manual entry. A weekly job (`scorecard-refresh-weekly`, Monday 04:00 Sydney, after the Monday 03:30 snapshot) now calls `scorecard-refresh`, so a new week of CST entries arrives automatically; system entries are recorded against Carl Simpao's account because no scorecard system account exists. The four metrics that had no working resolver (Active ComplyHub Users %, CHC, Validation, Projects On Track) were switched to manual entry the same day, so the weekly job now processes only the five CST metrics. Still to do: the CST sets real targets, and the team records those four by hand each week or someone builds their calculations. Steps, data changes and rollback are in the audit entry.

## Plain names (applied 18 November 2026)

The five CST measures read as: **People using the portal** (`cst_client_activity_rate_pct`), **Clients using the portal** (`cst_rtos_with_activity_pct`), **Certificates issued** (`cst_certificates_issued_count`), **Users who never signed in** (`cst_users_never_signed_in_count`) and **Quiet RTOs** (`cst_rtos_no_activity_count`). The definitions above are unchanged; only the display name and description changed, and the keys the refresh uses did not. The nine other measures were renamed the same way; the full old-to-new list, the targets as stored and the revert note are in [the audit entry](../../audit-log/entries/2026-11-18-scorecard-plain-redesign.md).

## Screens

Redesigned on 18 November 2026 after Carl's feedback that the first versions were confusing for non-technical people. Principles: say what is measured in a sentence, show every number against its aim with a word as well as a colour (On track, Nearly there, Off track, Waiting for a number), lead with what needs attention, and keep detail one click down. Plain names for the team: the CST category reads "Client engagement". The same status rule as before (10% amber band) sits behind the words.

- **Scorecard page** (`/eos/scorecard`): one headline sentence for the week, "Needs attention" cards (number, how far from the aim, an aim bar, the last eight weeks, owner), a "Waiting for a number" list where a manual number can be typed in ("$1,200" and "12 %" are read), and every measure grouped by area, closed by default, each opening to what it measures, where the number comes from, the aim bar, history and edit/archive. Week navigation goes back 11 weeks. The old tables, drawer and CST headline cards were removed. The per-consultant copies of CHC, Validation and Projects On Track (9 of 17 company rows) were merged into one row each on 17 November 2026, owner Angela Connell-Richards; the other six were archived. A metric has one owner; the split by primary CSC lives on the report.
- **Client activity report** (`/eos/cst-report`): a headline sentence, three big numbers (client users using the portal, certificates issued with the change from the period before, users who never signed in), then a by-CSC list with a usage bar and "x of y users" in words, expanding to RTOs with "last active" (from `get_cst_report`'s new `last_active_at`). The definitions moved into a "How these numbers are worked out" panel. Period choice and CSV export are unchanged.
- **L10 Scorecard segment**: the week as one sentence and a card per area, with a Discuss button that presents the areas one at a time, full screen (left and right arrow keys, filter to "Needs the room", wrap-up), the same pattern as Rock Review. Each slide shows the area's numbers against their aims, a question for the room, a note for the area (one per person per area per meeting, visible to the room), and "Raise it for IDS" on any measure not on track, which drafts the issue from the numbers and links it to the measure and the meeting (`eos_issues.linked_scorecard_metric_id`). Missing numbers can still be typed in from the segment. The configured `scorecard_metric_cap` no longer affects the segment.

## Why-this-number breakdowns and full reports (18 November 2026)

Each automatic client measure explains itself in the L10 Scorecard deck (a short strip on the card) and has a full report, opened from the deck, the Scorecard page's needs-attention card or the measure's row. The breakdown uses the weekly snapshot, one row per Live Client per week, so it always matches the headline; the certificate list and Academy activity read `academy_certificates`, `academy_enrollments` and `academy_courses` under the viewer's own staff access (no new database objects).

| Measure | Breakdown | Full report adds |
|---|---|---|
| Clients using the portal, Quiet RTOs | Active against quiet clients, the clients to start with, how many more would reach the aim | What changed since last week, the last weeks, by CSC, every client with people active and last active |
| Users who never signed in | Signed in against never signed in, the clients holding most of them | By CSC, by client, the people themselves as of today (name, client, date added) |
| Certificates issued | Count and clients | Who earned each certificate and for which course, by course, by client, Academy activity over 28 days (enrolments and how they were made, completions, busiest courses, courses nobody finished) |

Limits: the people list and last-active are as of today, not as of the week; "Enrolled, but nobody finished" only lists courses with three or more enrolments; manual measures have no breakdown. Ask Viv (below) is separate from these breakdowns and is on demand only.

## Ask Viv: an AI read of one measure (built 18 November 2026, not yet deployed)

An "Ask Viv" button on each measure in the L10 deck, and at the top of every measure's full report, asks the `scorecard-insight` Edge Function for a short plain-language read: what is happening, what may be behind it, what to try this week and who it falls to. It runs only when someone presses the button, needs the staff AI permission (`staff.ai.use`), stores nothing and creates nothing, and is labelled as written by AI. The model sees the measure, its recent numbers and, for the automatic client measures, the same client facts as the breakdown (business names, counts, last active, CSC names). It never receives learner names or email addresses. Anthropic's API is called directly, as Ask Viv does.

## Known defects found while scoping (unfixed)

- Every automatic scorecard metric has zero entries: `scorecard-refresh` returns null for the CHC, Validation and Active ComplyHub Users keys, and no scheduled caller was found.
- The L10 Scorecard segment used a different component from the Scorecard page, with binary status and a five-metric cap that showed only the first five by display order, so new CST metrics would never have appeared in the meeting. **Addressed** by the exceptions-first segment, then replaced by the discussion deck (see Screens). The older entry grid is no longer used by the segment.
- Likely week-key mismatch (not confirmed against data): the refresh function keys entries by Sunday, the L10 grid by Monday.
- The last 8 L10s averaged 94 minutes against 90 planned.

## Open decisions

1. ~~Cohort~~ Decided 18 November 2026: Live and lifecycle active (53).
2. Targets: the CST sets the five values above.
3. CSC attribution when an assignment changes mid-period: recommend the CSC as at that week, which the snapshot design provides.
4. Where the CST report lives (EOS area or the Manage Tenants area).
5. The "CST" naming conflict with the KPI module.

## Related documents reviewed, intentionally unchanged

[`eos-meeting-overhaul-plan.md`](../handoffs/eos-meeting-overhaul-plan.md) (L10 stages; this work extends Stage 3 and does not contradict it), [`kpi-module.md`](../codebase-state/kpi-module.md) (terminology only), `docs/kb/codebase-state/architecture.md` (no architecture change until something is built).
