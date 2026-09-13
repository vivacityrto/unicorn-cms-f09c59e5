# Client Health H0.3b/c — forecast-job disposition evidence

> **Last updated:** 2026-09-13 · **Status:** read-only evidence complete; owner disposition approved 2026-09-13 — retain functions/tables as evidence, keep jobs stopped, and keep consumers unavailable; replacement-shadow work remains separately gated
> **Parent packet:** [H0.3 risk/retention consumers and unknown-state disposition](h0-3-risk-retention-consumer-unknown-state-packet.md)
> **Parent plan:** [Client Health Activity Analytics Plan](../../client-health-activity-analytics-plan-2026-09-03.md)
> **Scope:** source, schema, caller, downstream-consumer, cron, and recent-log reconciliation only
> **Audit entry:** none needed — read-only repository and Supabase metadata/aggregate queries; no function invocation, deployment, cron, schema, RLS, grant, or data change

## Executive finding

The two composite forecast jobs are not safe repair candidates in their current
form. Both are still deployed, but their former cron schedules are absent, the
four output/history tables are empty, and neither function has a repository
caller. The retention job has several direct source-schema mismatches; the risk
job has two source-column mismatches that are silently treated as empty because
their query errors are not checked. Current downstream consumers have already
been changed to represent missing burn/retention evidence as unavailable.

**Recommendation:** classify both jobs as **retire/mark unavailable for the
current composite-score contract**, retain their functions, tables, views, and
history as evidence, and do not restart or repair them by assumption. A future
replacement should be a separately versioned Client Health shadow contract with
fresh source mappings, coverage/freshness telemetry, synthetic fixtures,
tenant-scope tests, and an owner-approved disposition.

This recommendation is consistent with ADR-025: the first analytical pilot is
the real-signal consultant attention watchlist, not a resurrection of the
dormant composite retention/risk infrastructure.

## Live deployment and repository parity

The live Supabase metadata and source were inspected on 2026-09-13. Both jobs
are deployed as active functions with JWT verification disabled because they
were designed as cron-only workers; their in-function `isCronAuthorized` gate
remains present. The deployed files were compared directly with
`origin/main` and matched exactly, including the shared dependencies returned
by the deployment API:

| Function | Live version | Live status | Live entrypoint | Deployed source parity |
| --- | ---: | --- | --- | --- |
| `run-tenant-risk-forecast` | 536 | ACTIVE | `functions/run-tenant-risk-forecast/index.ts` | exact match for `index.ts`, `_shared/cron-auth.ts`, `_shared/cors.ts` |
| `run-retention-forecast` | 534 | ACTIVE | `functions/run-retention-forecast/index.ts` | exact match for `index.ts`, `_shared/cron-auth.ts`, `_shared/cors.ts` |

The deployment API bundle hashes were `7ef5277f…f3c73` and
`38a1764d…df152`, respectively. The hashes are deployment metadata; the
file-by-file comparison is the source-parity evidence used here.

## Scheduling, invocation, and output evidence

- The live `cron.job` query returned no rows for either
  `run-tenant-risk-forecast-nightly` or `run-retention-forecast-nightly`.
  Their removal is already recorded by the 2026-09-08 M4 retirement entry.
- The live counts on 2026-09-13 were zero for
  `tenant_risk_forecasts`, `tenant_retention_forecasts`,
  `risk_forecast_history`, and `retention_forecast_history`.
- The same query returned 416 tenants, but the composite jobs have no active
  schedule and were not invoked as part of this audit.
- A read-only `function_edge_logs` query over the available recent window
  returned no invocation rows for either function. Log retention is limited;
  this does not make a claim about periods older than the available window.
  The earlier 500 responses documented by H0.1-b remain historical evidence,
  not a reason to restart either job.

## Source/live-schema reconciliation

The output table columns themselves still match the insert shapes in both
workers. The input contracts do not.

| Job | Source query in deployed code | Live result | Impact |
| --- | --- | --- | --- |
| Risk | `evidence_gap_checks.gap_details_json` | live table has `required_categories_json`, `detected_categories_json`, and `missing_categories_json`, but no `gap_details_json` | query error is ignored; evidence-instability input becomes empty rather than a measured value |
| Risk | `regulator_change_events.affected_clauses_json` | live table has `affected_areas_json`, but no `affected_clauses_json` | query error is ignored; regulator-overlap input becomes empty rather than a measured value |
| Retention | `consult_logs.duration_minutes` | live table has `hours`, but no `duration_minutes` | query error is ignored; engagement input becomes zero |
| Retention | `client_packages.allocated_hours`, `used_hours` | live table has `included_minutes`, but no `allocated_hours` or `used_hours` | query error is ignored; utilisation falls back to the neutral default |
| Retention | `tasks.due_date` | live table has `due_date_ms`, `due_date_text`, and `due_date_at`, but no `due_date` | query error is ignored; overdue-task input becomes zero |

Other referenced fields such as tenant `status`, risk-event severity and
timestamps, task `status`/`updated_at`, consult-log `created_at`, copilot
session `started_at`, and risk-forecast `forecast_risk_status` do exist. That
partial compatibility does not make the composite result valid: the missing
columns affect scored dimensions and the failed queries are not surfaced as an
unknown result.

## Caller and downstream-consumer inventory

No frontend or Edge caller invokes either worker by function name outside the
worker source and historical migration/docs. The current table consumers are
different from job callers:

| Surface | Current reference | Disposition relevance |
| --- | --- | --- |
| `useDashboardTriage` | reads retention/burn source rows and maps empty/error/missing rows to `unavailable` | already contained; do not restart jobs to satisfy the UI |
| `useRetentionForecast` / `CommercialRiskWidget` | reads retention forecasts and marks empty/error overview unavailable | overview containment delivered; `useLatestRetentionForecast` has no repo caller |
| `TeamCapacityWidget` | reads burn forecasts and distinguishes unavailable from zero critical clients | containment delivered |
| `ClientRiskForecastWidget` | reads `tenant_risk_forecasts` directly | separate risk-forecast consumer; current composite risk contract remains unapproved for repair |
| `useStrategicCommand` | reads `tenant_risk_forecasts` | downstream risk consumer; no current job caller found |
| `copilot-chat` | reads `tenant_risk_forecasts` | Edge downstream consumer; no current job caller found |
| `run-retention-forecast` | reads the latest risk forecast as one input | chained dormant worker; does not establish a live caller |
| `run-strategic-signal-analysis`, `strategic-orchestration`, `risk-command-engine` | read risk forecasts in Edge code | no cron/job/frontend invocation was found in the repository; retain as separate future-scope evidence |
| `v_dashboard_tenant_portfolio`, `v_dashboard_priority_inbox`, `v_risk_forecast_trends`, `v_retention_risk_trends`, `v_strategic_portfolio_risk` | views/materialized views reference forecast tables | retain views and definitions; do not drop or rewrite them in this packet |

The output tables' RLS remains part of the existing contract: retention
forecasts are selected for Vivacity internal staff, while risk forecasts and
history have staff/tenant-access policies. The audit did not alter or broaden
those policies.

## Disposition and required next decision

| Job | Recommended classification | Why | Not authorized |
| --- | --- | --- | --- |
| `run-tenant-risk-forecast` | retire/mark unavailable for the current composite contract | no cron, no recent invocation, zero output/history, no direct caller, and two source-column mismatches; downstream readers are either contained or separate dormant consumers | no function deletion, table/view deletion, redeploy, repair, cron restart, or backfill |
| `run-retention-forecast` | retire/mark unavailable for the current composite contract | no cron, no recent invocation, zero output/history, no direct caller, and three material source-column mismatches; ADR-025 defers this composite infrastructure | no function deletion, table/view deletion, redeploy, repair, cron restart, or backfill |

The owner disposition is recorded as: retain the functions, tables, views, and
history as evidence; keep both jobs stopped; and keep the current composite
consumer result unavailable. A replacement-shadow path remains a separate
future authorization. If chosen, it must first define the health subject grain,
source contracts, freshness/coverage floors, unknown behavior, authorization
boundary, run ledger, rollback owner, and synthetic/live-safe verification
plan. It must not be implemented by editing or reactivating these legacy
workers.
