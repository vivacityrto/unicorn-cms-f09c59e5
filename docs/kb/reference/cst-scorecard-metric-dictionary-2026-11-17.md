# CST scorecard metric dictionary (17 November 2026)

> **Last updated:** 2026-11-17 · **Reconsider by:** 2027-02-17 · **Confidence:** high for the definitions and the measured figures (queried read-only on production, 17 November 2026); the data layer is applied to `unicorn-qa` and to production (17 November 2026), with the snapshot table not yet backfilled and no CST metrics created; targets are placeholders.
>
> Definitions for the CST team scorecard and the matching changes to the EOS Scorecard page and the L10 Scorecard segment. The L10 Segue segment is out of scope. Standalone feature work, not one of the four tracked initiatives. The EOS module is Vivacity-internal; this reads client data but is only shown to Vivacity staff. Evidence, QA results, production steps and rollback: [audit entry](../../audit-log/entries/2026-11-17-cst-scorecard-activity-report.md).

## Terms

| Term | Meaning here | Source of truth |
|---|---|---|
| **CST** | The primary CSCs: one primary assignment per RTO that has not ended. | `tenant_csc_assignments` where `is_primary` and `ended_at` is null (the lookup Manage Tenants uses) |
| **Live Clients** | RTOs with status Active, On hold, In Arears or Warning, not archived, RTO accounts only (tenant metadata has no `academy_solo`). 57 RTOs on 17 November 2026. | Manage Tenants `LIVE_STATUSES` and its default "Live" filter |
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
- Manage Tenants' CSC load chips use `lifecycle_status = 'active'` (54 RTOs), not the Live definition (57). **Open:** choose one cohort for both screens.

## Data design (built; applied to `unicorn-qa` and production)

- `get_cst_report(period, anchor)` computes any period live (week, month, year, last 28 days, each with its prior period). Staff only.
- `cst_scorecard_weekly_snapshot`: one row per Live RTO per week (Sunday week ending, Sydney time) holding the CSC as at that week, client users, users active in the 28 days to week end, never-signed-in users and certificates issued that week. Written by `snapshot_cst_week` (weekly `pg_cron` job, Monday 03:30 Sydney) and `backfill_cst_snapshots`. Staff read only.
- `get_cst_team_metric(key, week_ending)` feeds `scorecard-refresh` for five keys: `cst_client_activity_rate_pct`, `cst_rtos_with_activity_pct`, `cst_certificates_issued_count`, `cst_users_never_signed_in_count`, `cst_rtos_no_activity_count`.
- Past weeks use the current user base and current Live status because neither history is stored.
- Applied to production on 17 November 2026 and verified read-only. Still to do: backfill the snapshot (13 weeks), then create the five CST metrics with real targets. Steps and rollback are in the audit entry.

## Screens

- **CST report** (`/eos/cst-report`, built): Week, Month, Year and Last 28 days, grouped by primary CSC, expandable to RTOs, with prior-period comparison and CSV export.
- **Scorecard page** (built): four CST headline cards above the existing tables, and five CST metric templates (category CST) so the team scorecard can be created from Add Metric. **Not done:** collapsing the per-consultant copies of CHC, Validation and Projects On Track (9 of 17 company rows) into one row each with a split. That is a data change and needs the CST's decision on owners.
- **L10 Scorecard segment** (built): every active metric, worst first (off track, at risk, out of date, no data), on-track metrics closed. The configured `scorecard_metric_cap` (5) now sets how many to-discuss metrics start expanded rather than hiding the rest. Live entry and Add to Issues are unchanged. Facilitator reads numbers, discussion happens in IDS.

## Known defects found while scoping (unfixed)

- Every automatic scorecard metric has zero entries: `scorecard-refresh` returns null for the CHC, Validation and Active ComplyHub Users keys, and no scheduled caller was found.
- The L10 Scorecard segment used a different component from the Scorecard page, with binary status and a five-metric cap that showed only the first five by display order, so new CST metrics would never have appeared in the meeting. **Addressed** by the exceptions-first segment (see Screens). It still renders the older entry grid inside each expanded metric.
- Likely week-key mismatch (not confirmed against data): the refresh function keys entries by Sunday, the L10 grid by Monday.
- The last 8 L10s averaged 94 minutes against 90 planned.

## Open decisions

1. Cohort: Live (57) or lifecycle-active (54) for Manage Tenants chips and this scorecard.
2. Targets: the CST sets the five values above.
3. CSC attribution when an assignment changes mid-period: recommend the CSC as at that week, which the snapshot design provides.
4. Where the CST report lives (EOS area or the Manage Tenants area).
5. The "CST" naming conflict with the KPI module.

## Related documents reviewed, intentionally unchanged

[`eos-meeting-overhaul-plan.md`](../handoffs/eos-meeting-overhaul-plan.md) (L10 stages; this work extends Stage 3 and does not contradict it), [`kpi-module.md`](../codebase-state/kpi-module.md) (terminology only), `docs/kb/codebase-state/architecture.md` (no architecture change until something is built).
