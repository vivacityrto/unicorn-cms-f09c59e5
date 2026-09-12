# Client Health H0.1-b — dashboard query family, formula, and freshness characterization

> **Last updated:** 2026-09-12 · **Reconsider by:** 2026-10-12 · **Confidence:** high — live characterization and linked synthetic fixture oracle are current

> **Parent plan:** [Client Health Activity Analytics Plan](../../client-health-activity-analytics-plan-2026-09-03.md) — §10 H0.1
> **Sibling packet:** [H0.1-a — notes & tasks characterization](h0-1-a-notes-and-tasks-characterization.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** delivered 2026-09-11 — read-only live characterization of the actual dashboard query family (§4 of the parent plan), grounding the plan's prose description in real SQL/data for the first time.
> **Owner:** Claude Code
> **Evidence:** live Supabase MCP read-only queries against production (`pg_get_viewdef`, `pg_get_functiondef`, `cron.job`, row counts), 2026-09-11
> **Audit entry:** none — read-only queries only, no schema/RLS/grant/data change

## Headline finding — flag for Carl before anything else in this doc

**Every one of the 54 active tenants currently shows `burn_risk_status:
'normal'` and `retention_status: 'stable'` on the triage dashboard and its
Ask Viv consumers — not because any of them have actually been assessed as
low-risk, but because the tables these statuses come from
(`tenant_package_burn_forecast`, `tenant_retention_forecasts`) are **100%
empty** (0 rows each) in production, and no scheduled job populates them.**
This is the exact "known-defective/missing inputs interpreted as
healthy/stable" failure mode H0.0 already contained for *stage health*
(confirmed below — that containment is real and working) — but burn-risk
and retention-status are not covered by that containment and are silently
defaulting to reassuring-sounding labels for every tenant, all the time.
This is a live finding, not a historical one; it needs the same H0.0-style
decision (contain/badge vs. accept as known gap) that stage health already
got, not a silent carry-forward into H1.

## Confirmed: stage health containment is real and working as designed

`v_dashboard_tenant_portfolio`'s stage-health lateral join is:

```sql
LEFT JOIN LATERAL (
  SELECT 'unavailable' AS worst_health, 0 AS critical_count, 0 AS at_risk_count
) sh ON true
```

A literal stub, not a join to any real stage-health table — this is P3-A's
containment, confirmed live and exactly matching program-index's claim
that "P3-A has contained the legacy stage-health signal." Good: this part
of H0.0 is genuinely done, not just claimed done.

## The exact live attention-score formula

`calculate_attention_score()` (SQL, `IMMUTABLE`):

```sql
round(0.25*stage + 0.20*gaps + 0.15*risk + 0.15*staleness + 0.15*tasks + 0.05*renewal + 0.05*burn)
-- then: if overdue_tasks >= 3 and score < 70, force score = 70
```

This matches the parent plan's §4 prose description exactly (25/20/15/15/15/5/5
+ the floor-of-70 override) — now confirmed against the live function body,
not just historical intent. Sub-scores, also confirmed live:

| Sub-score | Formula (as implemented) |
|---|---|
| `stage_score` | Fixed 0 (input is always `'unavailable'`/0/0 per the containment stub above) + capped critical/at-risk stage additions that can never fire while the stub is in place |
| `gaps_score` | `0` if no mandatory gaps, else `LEAST(100, gaps_count * 20)` |
| `risk_score` | `LEAST(100, GREATEST(0, risk_index + LEAST(25, risk_index_delta_14d*1.5) + LEAST(25, high_severity_open_risks*10)))` — `risk_index_delta_14d` is hardcoded `0` in the base view (no 14-day trend is actually computed); `high_severity_open_risks` is always `0` (see `risk_events` below) |
| `task_score` | `LEAST(100, overdue*25 + blocked*15 + open*3)` from `v_tenant_compliance_task_metrics` |
| `staleness_score` | Tiered by days-since-activity (0/25/50/75/100 at 7/14/21/30-day breakpoints) + 10 if tasks open and inactive ≥15 days |
| `renewal_score` | Tiered by days-to-renewal (100/75/50/25/0 at 14/30/60/90-day breakpoints), `0` if no renewal date |
| `burn_score` | `100` if `burn_risk_status='critical'`, `50` if `'accelerated'`, else `0`, +15 if exhaustion date within 30 days — **always evaluates against the always-`'normal'` default above** |

**Net effect: of the 7 weighted components, `stage_score` (25%) and most of
`risk_score`'s inputs (part of 15%) and `burn_score` (5%) are currently
structurally inert** — not necessarily wrong today (nothing produces a false
positive), but not actually measuring what their weights imply either. Real
signal currently comes from `gaps_score`, `task_score`, `staleness_score`,
and `renewal_score` — roughly 55% of the nominal formula weight is live,
45% is currently a fixed baseline.

## Cron/scheduled-job inventory (all 18 active jobs, full list)

No filtering — every active `cron.job` row, to answer H0.1's "scheduled
functions, cron/log outcomes" ask directly rather than by keyword guess:

| Job | Schedule | Touches health/risk data? |
|---|---|---|
| `seed-compliance-tasks-nightly` | `0 2 * * *` | No |
| `generate-notifications-meetings-v2` | hourly | No |
| `generate-notifications-daily-v2` | `5 0 * * *` | No |
| `process-notification-outbox` | `*/5 * * * *` | No |
| `sync-outlook-calendar-every-30min` | `*/30 * * * *` | No |
| `close-stale-preview-sessions` | `0 */4 * * *` | No |
| `reclaim-stale-cohort-locks` | `*/5 * * * *` | No |
| `email_tickets_flag_sla_breaches` | `*/5 * * * *` | No |
| `generate-notifications-reporting-obligations` | `15 0 * * *` | No |
| `bulk-documents-reclaim-locks` | `*/5 * * * *` | No |
| `bulk-documents-purge-items` | `15 3 * * *` | No |
| `reconcile-invite-delivery-status` | `*/20 * * * *` | No |
| `send-action-item-due-reminders-nightly` | `0 20 * * *` | No |
| `embed-ask-viv-corpus-incremental` | `*/30 * * * *` | No |
| `embed-ask-viv-documents-incremental` | `*/30 * * * *` | No |
| `portal-activity-digest-daily` | `15 0 * * *` | No |
| `generate-ask-viv-faqs-daily` | `17 3 * * *` | No |
| `xero-invoice-sync-all-every-6h` | `0 */6 * * *` | No |
| `regulator-watch-check-weekly` | `0 4 * * 1` | **Yes** — only job that populates any Priority Inbox source table |
| `bulk-generate-resume-stalled` | `*/2 * * * *` | No |

**Zero cron jobs populate** `real_time_risk_alerts`, `evidence_gap_checks`,
`tenant_package_burn_forecast`, `tenant_retention_forecasts`, `risk_events`,
or `playbook_activations`. This directly corroborates the parent plan's
H0.3b/H0.3c notes about `run-tenant-risk-forecast` and
`run-retention-forecast` returning 500s — there is no scheduled invocation
of either job at all currently, not an intermittent failure.

## Row coverage and freshness of every Priority Inbox source table

| Table | Rows | Latest timestamp | Populated by |
|---|---:|---|---|
| `real_time_risk_alerts` | 0 | — | Nothing found |
| `evidence_gap_checks` | 0 | — | Nothing found |
| `tenant_package_burn_forecast` | 0 | — | Nothing found |
| `tenant_retention_forecasts` | 0 | — | Nothing found |
| `risk_events` | 0 | — | Nothing found |
| `regulator_change_events` | 7 | 2026-09-07 | `regulator-watch-check-weekly` cron |
| `playbook_activations` | 0 | — | Nothing found |

`v_dashboard_priority_inbox` is a `UNION ALL` of 7 sources (the 6 above plus
`v_dashboard_priority_inbox_overdue_compliance`, not separately
characterized in this packet). In production today, **6 of those 7
branches can never return a row** — the Priority Inbox's actual live
content is entirely the overdue-compliance branch plus, at most, 7
regulator-change rows.

## Other views characterized

- `v_dashboard_behavioural_prompts` — 3 hardcoded rule branches (no-consult-30d,
  inactive-21d, gap-check-60d), all reading from `v_dashboard_tenant_portfolio`
  directly, no separate source table. Not affected by the empty-table finding
  above.
- `v_dashboard_risk_clusters` — groups `risk_events` by `standard_clause`;
  since `risk_events` has 0 rows, **this view always returns zero rows in
  production** — the "Risk Cluster Snapshot" panel is currently structurally
  empty, not filtered-empty.
- `v_dashboard_labour_efficiency` — joins `users` (filtered to specific
  `unicorn_role`s) to the portfolio view and `consultant_capacity_profiles`;
  not dependent on any of the empty tables above, so this one is live and
  meaningful.
- `v_dashboard_tenant_recent_comms` — reads `notes` (11,524 rows, live) and
  `email_messages`; ranks top-5 per tenant per source. Live and meaningful.

## What this means for H0.1's own action items

- **"Document exact formulas, defaults, caps, fallbacks and caller
  permissions"** — done for the attention-score formula and its 7
  sub-scores above; caller permissions were already covered by the parent
  plan's §4 (SECURITY DEFINER RPC gated by `is_vivacity_team_safe`).
- **"Scheduled functions, cron/log outcomes"** — done: full 18-job
  inventory above, cross-referenced against every risk/forecast table.
- **Synthetic characterization fixtures** (high activity/healthy, distressed,
  stalled, missing-sources, future-timestamps) — delivered under
  [`H0.1-c — dashboard query synthetic fixture scope`](h0-1-c-dashboard-query-synthetic-fixture-scope.md),
  which contains the versioned test-only manifest and deterministic local
  assertion runner. This remains a characterization oracle, not a production
  view replacement.
- **Mark July dashboard-health KB conclusions historical/superseded** — done
  for [`dashboard-overhaul-mockup.md`](../../dashboard-overhaul-mockup.md),
  which is retained as history with an explicit superseded banner.

## Recommendation (not a decision — Carl's call)

The burn-risk/retention-status finding is materially the same class of
problem H0.0 already fixed for stage health, just not yet covered by that
same containment. Worth an explicit decision: either (a) apply the same
`'unavailable'`-style badge/containment to `burn_risk_status`/
`retention_status` until real forecast jobs exist, or (b) explicitly accept
the current all-tenants-normal default as a known, documented gap with a
containment badge distinguishing "assessed as low-risk" from "never
assessed." Not fixed here — this packet only characterizes and flags it,
per H0.1's own read-only scope.

## Verification

Read-only live SQL queries only (`pg_get_viewdef`, `pg_get_functiondef`,
`cron.job`, aggregate row counts) — no schema, RLS, grant, function, or
data change. No code changed, so no lint/typecheck/test suite applies.
