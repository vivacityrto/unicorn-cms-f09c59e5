# Client Health H0.3 — risk/retention consumers and unknown-state disposition

> **Last updated:** 2026-09-12 · **Status:** planning packet; no consumer, forecast, cron, schema, or production change authorized
> **Parent plan:** [Client Health Activity Analytics Plan](../../client-health-activity-analytics-plan-2026-09-03.md)
> **Inputs:** [H0.1-b dashboard query characterization](h0-1-b-dashboard-query-family-characterization.md); [H0.1-c synthetic fixture scope](h0-1-c-dashboard-query-synthetic-fixture-scope.md); [P3-A consumer characterization](../../codebase-optimization/phase-3/p3-a-client-health-consumer-characterization.md); [consultant research project pack](../../../handoffs/client-health-consultant-research-project-pack.md)
> **Owner:** Client Health, with TOM, RBAC, security, and consultant review
> **Audit entry:** none needed — evidence/planning only; no live query, cron, forecast, data, authorization, or UI behavior changed

## Purpose and boundary

H0.1-b established a live defect: every one of the 54 active tenants is
currently surfaced with `burn_risk_status = 'normal'` and
`retention_status = 'stable'`, while both source forecast tables are empty and
no active cron job populates them. This packet turns that finding into a
bounded consumer inventory and an implementation-ready unknown-state
characterization plan.

It does not decide whether Carl should suppress the labels, add an unavailable
badge, repair or retire the forecast jobs, or accept the current behavior as a
documented gap. It does not restart cron, run a forecast, alter a view/RPC,
change a type, deploy an Edge Function, or modify production data. A future
code packet must be separately authorized after the owner decisions and
consultant input below.

## Current evidence baseline

The delivered H0.1-b characterization records:

- `tenant_package_burn_forecast`: 0 rows;
- `tenant_retention_forecasts`: 0 rows;
- `risk_events`, `real_time_risk_alerts`, `evidence_gap_checks`, and
  `playbook_activations`: 0 rows;
- no active cron job populates the burn, retention, risk, evidence-gap, or
  playbook tables;
- the latest observed 24-hour log window had `run-tenant-risk-forecast` and
  `run-retention-forecast` failures; and
- the portfolio/dashboard read path still supplies reassuring defaults that
  downstream consumers treat as ordinary status values.

The correct characterization is therefore **missing/unassessed**, not
low-risk/stable-retention. The distinction must be retained even if the
eventual product decision is to keep the existing visual treatment temporarily.

## Consumer inventory

This is a source-backed inventory of the consumers that must be characterized
before any unknown-state change. It is not a new authorization or metric
contract.

| Consumer | Current surface | Current use of risk/retention | Required characterization |
| --- | --- | --- | --- |
| `useDashboardTriage` | Triage dashboard and related attention views | Filters `burnRiskOnly`; excludes `high_risk`/`vulnerable` retention from low-attention; creates burn and retention focus items; computes KPIs | Empty, stale, failed, and valid-source rows must produce distinguishable outcomes; unknown must not enter the “low attention” bucket |
| `AttentionRankingSection` | Dashboard attention table | Renders retention badges only for `high_risk`/`vulnerable`, otherwise a dash | Verify unknown is not rendered as an implicit stable/empty risk badge and does not disappear from the explanatory row |
| `TenantDrawer` | Portfolio tenant detail drawer | Displays `burn_risk_status` as a direct label | Verify source freshness/reason can accompany or replace the label without claiming an assessment |
| `TeamCapacityWidget` | Executive/team capacity widget | Directly reads `tenant_package_burn_forecast` and counts critical burn tenants | Empty source must be represented as unavailable/not assessed, not zero critical tenants; tenant scope and staff visibility require RBAC review |
| `useRetentionForecast` | Retention summary and tenant forecast views | Reads `tenant_retention_forecasts`, aggregates statuses, renewal-window counts, and revenue at risk | Empty/error/stale results must not become an all-stable summary or zero revenue-at-risk claim |
| `portfolio-facts.ts` | Ask Viv structured portfolio facts | Copies `burn_risk_status` into the fact contract | Unknown reason/freshness must survive into the protected fact contract; caller-safe redaction still applies |
| `ask-viv-assistant` | Ask Viv portfolio context | Reads ranked attention rows including `burn_risk_status` | Verify missing/failed sources are explained as unavailable without exposing hidden-source or authorization details |
| `v_dashboard_tenant_portfolio` and ranked views | Shared source for dashboard/Ask Viv | Supplies risk/burn/retention columns and attention inputs | Characterize exact defaults, joins, freshness fields, and consumer permissions before changing any view or RPC |

The inventory must be re-run on the candidate implementation commit. Static
grep alone is insufficient: the final ledger must include indirect view/RPC/
Edge consumers and the relevant route or function tests.

## Unknown-state contract for review

The following is a proposed **characterization vocabulary**, not an approved
product decision. It gives tests and reviewers a stable way to distinguish an
assessment from absent evidence without choosing the final UI.

### Source states

| State | Meaning | Caller-safe reason |
| --- | --- | --- |
| `assessed` | A versioned forecast exists, is within its freshness window, and passed source-quality checks | `null` or a permitted assessment reason |
| `source_empty` | No forecast row exists for the requested tenant/cohort | `source_unavailable` |
| `job_failed` | The latest generation run failed or produced an invalid result | `source_unavailable` |
| `no_run` | No accepted run ledger entry exists for the current contract/version | `source_unavailable` |
| `stale` | A row exists but is older than the approved freshness window | `source_stale` |
| `invalid` | Row or source fields fail validation, schema, or reconciliation checks | `source_unavailable` |
| `not_applicable` | The metric is intentionally outside the subject's scope | `not_applicable` |
| `not_authorized` | Caller cannot see the source | Generic `unavailable`; exact reason stays protected |

The caller-facing result should never reveal whether a hidden source exists.
Protected diagnostics may retain the exact run/source failure, version, and
authorization context. A status value such as `normal` or `stable` is valid
only when paired with an accepted, fresh, quality-checked forecast—not merely
when a left join or `COALESCE` has supplied a default.

### Run-ledger minimum fields

Any future forecast repair or replacement must be versioned and observable,
but this packet does not authorize its implementation. The minimum evidence
for a later H0.3a packet is:

- metric and contract version;
- run ID, requested/started/completed timestamps, and source watermark;
- input row count, distinct-tenant count, skipped/invalid count, and error
  count;
- output row count and distinct-tenant count;
- source freshness and coverage percentages;
- status of `success`, `partial`, `failed`, or `aborted`;
- error class and protected diagnostic reference; and
- owner, retry/idempotency key, and retention/rollback reference.

No consumer may treat `success` with incomplete/truncated coverage as a
complete assessment. A missing or failed run remains unknown.

## H0.3b/H0.3c job disposition packet

The two named forecast functions require separate source-to-consumer evidence
before anyone repairs or retires them:

1. capture the deployed source and current live function definition;
2. compare referenced columns/tables with the current schema and generated
   types, including the known retention `duration_minutes` versus live `hours`
   mismatch;
3. enumerate all repository callers, Edge-to-Edge invocations, cron rows,
   logs, and downstream tables/views/RPCs;
4. determine whether a valid current consumer exists, who owns the business
   meaning, and what freshness/coverage contract it requires;
5. classify each outcome as `repair-shadow`, `retire-mark-unavailable`, or
   `blocked-needs-owner-decision`; and
6. preserve old tables/history as evidence until a separately authorized
   disposition exists.

Neither a historical function name nor an empty output table is sufficient
evidence to restart a job. A repair candidate must have a versioned input
contract, synthetic fixtures, negative/tenant-scope tests, run ledger,
rollback owner, and a shadow comparison plan.

## H0.3d consumer adoption sequence

The safest future implementation order is additive and reversible:

1. freeze the current consumer inventory and synthetic fixture expectations;
2. add a test-only adapter or contract characterization for `assessed`, empty,
   stale, failed, invalid, and unauthorized cases;
3. decide the caller-safe presentation for each consumer (badge, omitted
   metric, explicit unavailable panel, or other approved treatment);
4. update one consumer family at a time behind a reviewable switch, preserving
   the operational attention workflow and raw evidence links;
5. verify dashboard, executive, portfolio, Ask Viv, and retention summaries
   cannot classify unknown rows as low/stable; and
6. only then consider a separately approved shadow forecast or replacement
   source.

This sequence deliberately ships unknown-state containment separately from any
replacement score. It also prevents a future forecast repair from silently
becoming an unreviewed health policy.

## Consultant-data dependency and decision gates

The [consultant research project pack](../../../handoffs/client-health-consultant-research-project-pack.md)
still has an outstanding operational-data dependency. Consultant input is
required for normal versus concerning engagement cadence, blocker ownership,
intervention patterns, quiet/data-insufficient clients, and pilot usefulness.
Until those reports are supplied and consolidated:

- H1 metric definitions, thresholds, confidence semantics, and pilot cohorts
  remain provisional;
- the packet may characterize technical consumers and synthetic missing-state
  behavior, but may not infer consultant policy from repository or live data;
- no replacement risk/retention score or forecast interpretation may be
  presented as authoritative; and
- examples used in future evidence must be synthetic, deidentified, or
  irreversibly redacted.

## Exit criteria and unresolved ownership

The H0.3 preparation packet is complete for implementation review when:

- all listed direct and indirect consumers have an owner and current-source
  evidence;
- synthetic fixtures cover assessed, empty, stale, failed, invalid, future,
  and unauthorized outcomes for both metrics;
- job source/schema/log/cron history is reconciled without restarting either
  forecast function;
- the caller-safe unknown vocabulary and freshness/coverage fields are
  approved for characterization (not yet a metric-policy approval);
- RBAC/TOM review the staff/client scope and tenant identity path;
- Client Health records the consultant-data dependency and expected handoff;
  and
- Carl chooses a disposition for the live 54-tenant finding.

| Open item | Owner | Evidence/decision needed |
| --- | --- | --- |
| Current 54-tenant normal/stable presentation | Carl / Client Health | Suppress/mark unavailable, or explicitly accept a documented known gap |
| `run-tenant-risk-forecast` | Client Health + data owner | Consumer proof, source/live-schema comparison, repair-shadow vs retire decision |
| `run-retention-forecast` | Client Health + data owner | Consumer proof, source/live-schema comparison, repair-shadow vs retire decision |
| Caller-safe unknown presentation | Product + security | Approved generic reason/freshness contract with no hidden-source leakage |
| Portfolio/Ask Viv authorization | RBAC + TOM | Confirm ADR-030 staff scope and current tenant/resource proof |
| Operational semantics and pilot usefulness | AJ/Ezel/consultants + Carl | Consolidated reports before H1 thresholds, confidence, or pilot acceptance |
| Any code/view/RPC/cron/schema/data change | Named implementation owner | Separate authorization, focused tests, verification, rollback, and audit entry |

**Conclusion:** H0.3 is technically characterized enough to prepare a safe
unknown-state and consumer work queue, but it is not a license to repair the
forecast jobs or change user-visible labels. The current live values remain
unassessed until Carl decides the containment/acceptance path and the required
operational input arrives.
