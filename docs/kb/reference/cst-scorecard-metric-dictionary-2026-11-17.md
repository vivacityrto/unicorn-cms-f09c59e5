# CST scorecard metric dictionary (17 November 2026)

> **Last updated:** 2026-11-17 · **Reconsider by:** 2027-02-17 · **Confidence:** high for the definitions and the measured figures (queried read-only on production, 17 November 2026); the design is a reviewed mockup only, nothing is built; targets are placeholders.
>
> Definitions for the CST team scorecard and the matching changes to the EOS Scorecard page and the L10 Scorecard segment. The L10 Segue segment is out of scope. Standalone feature work, not one of the four tracked initiatives. The EOS module is Vivacity-internal; this reads client data but is only shown to Vivacity staff.

## Terms

| Term | Meaning here | Source of truth |
|---|---|---|
| **CST** | The primary CSCs: one primary assignment per RTO that has not ended. | `tenant_csc_assignments` where `is_primary` and `ended_at` is null (the lookup Manage Tenants uses) |
| **Live Clients** | RTOs with status Active, On hold, In Arears or Warning, not archived, RTO accounts only (tenant metadata has no `academy_solo`). 57 RTOs on 17 November 2026. | Manage Tenants `LIVE_STATUSES` and its default "Live" filter |
| **Client user** | A `tenant_users` row of a Live RTO whose profile is not `is_vivacity_internal` and not archived. 191 users on 17 November 2026, against 215 raw rows (18 are Vivacity staff). | `tenant_users` joined to `users` |
| **Client activity** | Any of these by a client user of that RTO: a portal page view, a `client_login` timeline event, a message sent or read, an Academy lesson completed or an Academy enrolment. Approved by Carl on 17 November 2026. | `client_portal_page_views`, `client_timeline_events` |
| **Not client activity** | Vivacity staff actions (including viewing a client's portal), `document_shared_to_client` (staff pushing a document, 14,080 of the 90-day events), system events (invoices, status changes), archived users. | Excluded by the actor filter above |
| **Course finished** | A certificate is issued, not an enrolment marked completed. | `academy_certificates.issued_at`, `revoked_at` null |

**CST terminology conflict.** [`kpi-module.md`](../codebase-state/kpi-module.md) uses "CST Assistants" for a different staff group. In this document CST means the primary CSCs, as directed on 17 November 2026. Resolve before either is shown in the same screen.

## Metrics

All five are automatic. Owner is each primary CSC for their own RTOs; the scorecard row shows the team total and the split sits behind it. Targets are proposals for the CST to set, not agreed values.

| Metric | Definition | Direction | Proposed target | Measured 17 Nov 2026 |
|---|---|---|---|---|
| Client activity rate % | Client users with client activity in the last 28 days ÷ client users | Higher | 50% | 43 of 191 (23%) |
| RTOs with client activity % | Live RTOs with at least one active client user ÷ Live RTOs that have client users | Higher | 60% | 21 of 55 (38%) |
| Certificates issued | Certificates issued in the period (week, month or year), with the prior period beside it | Higher | 12 a month | 5 in November to date, 15 in October, 61 in 2026 (8 RTOs) |
| Users never signed in | Client users whose profile has no sign-in | Lower | 15 or fewer | 30 of 191 |
| Live RTOs with no activity (28 days) | Live RTOs with client users and no active client user | Lower | 20 or fewer | 34 of 55 |

Notes:

- The 28-day window is rolling. Week and Month views of the report use calendar periods and report distinct active users in that period.
- Weekly certificate counts are very small (1 this week, 3 last week), so the report defaults to Month.
- Year views of certificates are complete. Year views of activity can only rely on timeline events: portal page views start on 4 August 2026.
- A login-based count (13 of 58 active-status RTOs with a login in 28 days, from the auth audit log) understated engagement because sessions persist; activity gives 21 of 55.
- The "lessons finished, assessment not passed" figure (113 enrolments on 17 November 2026) is not a headline metric. It is a possible drill-down column for CSC follow-up.

### Reference query shape (measured)

For each Live RTO: take the client users above; take distinct `(tenant_id, user_id)` from page views in the window plus distinct `(tenant_id, created_by)` from timeline events of type `client_login`, `message_sent`, `message_read`, `academy_lesson_completed` or `academy_enrolled` in the window; keep only pairs that match a client user. Actors that are not client users are discarded, which removes staff page views and staff actions.

## User reconciliation (data-quality flags)

- Manage Tenants' member count is every `tenant_users` row, including Vivacity staff and archived users. It is not the denominator.
- `tenant_members` (used by the Academy staff-stats RPC) disagrees with `tenant_users`: 13 rows only in `tenant_members`, 5 only in `tenant_users`, across Live RTOs. Treat as a flag for the CST, not a silent correction.
- `user_activity.tenant_id` is null on all 1,690 rows, so that table cannot give per-RTO activity.
- Manage Tenants' CSC load chips use `lifecycle_status = 'active'` (54 RTOs), not the Live definition (57). **Open:** choose one cohort for both screens.

## Proposed data design (not built)

A nightly snapshot per RTO per week, so trends and the per-CSC split do not depend on pruned or slow source queries: tenant, week ending, CSC as at that week, client users, active users, certificates issued, never-signed-in users. Staff read only. Populated by a scheduled function; earlier weeks backfilled from timeline events only. Adding this needs a migration, row-level security, a cron job and an entry in `docs/audit-log/entries/`; none is approved or started. Use one week-ending convention (Sunday) everywhere.

## Changes to existing screens (not built)

- **Scorecard page:** add the CST scorecard (five metrics) as a team scorecard that rolls up to the company scorecard when red. Collapse the per-consultant copies of CHC, Validation and Projects On Track (9 of 17 company rows) into one row each with a split, giving 11 company rows.
- **CST report:** Week, Month and Year, grouped by primary CSC, expandable to RTOs, with prior-period comparison and CSV export.
- **L10 Scorecard segment:** show every metric, not the first `scorecard_metric_cap` (default 5); show amber; keep green closed; each off-track metric gets Add to IDS, To-Do or Noted; facilitator reads numbers, discussion happens in IDS.

## Known defects found while scoping (unfixed)

- Every automatic scorecard metric has zero entries: `scorecard-refresh` returns null for the CHC, Validation and Active ComplyHub Users keys, and no scheduled caller was found.
- The L10 Scorecard segment uses a different component from the Scorecard page, with binary status and the five-metric cap, so new CST metrics would never appear in the meeting.
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
