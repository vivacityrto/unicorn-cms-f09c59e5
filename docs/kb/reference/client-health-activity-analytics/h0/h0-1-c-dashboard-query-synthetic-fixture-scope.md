# Client Health H0.1-c — dashboard query synthetic fixture scope

> **Last updated:** 2026-09-12 · **Reconsider by:** 2026-10-12 · **Confidence:** high — synthetic runner and expected snapshots are checked in and locally verified
>
> **Parent plan:** [Client Health Activity Analytics Plan](../../client-health-activity-analytics-plan-2026-09-03.md) — §10 H0.1
> **Sibling packet:** [H0.1-b — dashboard query family characterization](h0-1-b-dashboard-query-family-characterization.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** delivered 2026-09-12 — deterministic synthetic fixture manifest and local assertion runner; no production change
> **Owner:** Codex
> **Scope:** deterministic, synthetic characterization of the dashboard query family's row, score, freshness, and missing-source contracts
> **Dependencies:** H0.1-b's live query/formula characterization; RBAC v6 and TOM contracts remain prerequisites for any replacement health surface
> **Exit criteria:** five scenario fixtures and a repeatable assertion harness are separately implemented, reviewed, and shown to preserve tenant isolation and explicit unknown/default behavior
> **Evidence:** [fixture manifest and adapter](../../../../../src/test/client-health/fixtures/dashboardQueryFixtures.ts), [focused Vitest characterization](../../../../../src/test/client-health/dashboardQueryFixtures.test.ts), full local verification chain recorded in the implementation PR
> **Audit entry:** none needed — planning/documentation only; no schema, RLS, grant, function, cron, model, or data change

## Purpose and boundary

H0.1-b identified synthetic characterization fixtures as a separate, larger
undertaking. This packet defines the smallest useful next unit without
turning the fixtures into a health-model proposal or repairing the current
production defaults. The fixtures should characterize the current dashboard
query family and make unsafe behavior visible; they must not silently bless
the current `burn_risk_status='normal'` / `retention_status='stable'`
defaults when their source tables are empty.

The implementation packet should use synthetic, non-identifying records only.
It must not connect to production, insert into Supabase, restart cron jobs,
repair forecast tables, or change the dashboard's current behavior. Any
future target expectation that differs from current behavior must be labelled
as a proposed guardrail, not asserted as an existing contract.

## Characterized surface

The fixture harness should cover the row projection and formula boundaries
observed in H0.1-b:

- the tenant row and its source/freshness fields from
  `v_dashboard_tenant_portfolio`;
- attention-score composition and the overdue-task floor from
  `calculate_attention_score()`;
- the query-family branches represented by the attention, priority-inbox,
  behavioural-prompt, risk-cluster, labour-efficiency, and recent-comms
  views;
- empty, stale, future-dated, and unavailable source behavior; and
- tenant identity and authorization context as fixture metadata, not as a
  replacement for RBAC v6 negative tests.

The fixture format should retain `tenant_id`, source row identifiers where a
source exists, `observed_at`/freshness timestamps, and a scenario label. It
must not contain real tenant names, emails, note bodies, tokens, or copied
production rows.

## Required scenarios and assertions

| Scenario | Synthetic conditions | Required characterization assertions |
|---|---|---|
| High activity / healthy | Recent qualifying activity, no mandatory gaps, no open high-severity risks, valid future renewal, and completed or low-volume work | Row remains distinguishable from “missing”; score components are explainable; no empty-source fallback is presented as an assessment |
| Distressed | Overdue and blocked work, mandatory gaps, recent high-severity risk, and an approaching renewal | Driver fields identify the contributing sources; the `overdue_tasks >= 3` floor is exact; no component silently exceeds its cap |
| Stalled | Old activity timestamp, open work, and no recent client participation | Staleness and behavioural prompts are reproducible; inactivity is not converted into a health label without the declared health contract |
| Missing sources | Empty or unavailable risk, burn, retention, stage-health, and inbox-source inputs | Current defaults are captured verbatim for characterization, but the fixture flags when missing data is rendered as assessed healthy/stable; explicit unknown/reason metadata is the proposed replacement guardrail |
| Future timestamps | Activity, renewal, or source freshness timestamps later than the fixture clock | Negative ages/days-to-renewal are bounded and labelled; no future timestamp creates an accidental healthy/low-risk result; the fixture clock is fixed and visible |

Each scenario should include at least one negative assertion for tenant
isolation: a row or source event belonging to another synthetic tenant must
not affect the selected tenant's score, drivers, freshness, or inbox output.
The harness should also assert stable empty results for the currently empty
source branches, rather than treating “no rows” as a test failure by itself.

## Proposed implementation packet (separate from this scope)

The follow-up implementation should be one docs-and-test packet with:

1. a versioned JSON or TypeScript fixture manifest containing the five
   scenarios and a fixed clock;
2. a deterministic, local assertion runner for the formula and row-level
   invariants, with expected current-output snapshots kept separate from
   proposed unknown-state guardrails;
3. focused assertions for score caps, floor-of-70 behavior, empty-source
   defaults, freshness, future timestamps, and cross-tenant isolation; and
4. a short evidence table recording which behaviors are directly executable
   locally and which remain Inconclusive because the live SQL views require a
   hosted Supabase catalog.

The runner must not require production credentials. If a local view-equivalent
adapter is needed, it must be a test fixture adapter with no production
deployment path. A later H1 metric packet may replace the proposed guardrails
after RBAC/TOM scope, metric definitions, and Carl's burn/retention decision;
this H0.1 characterization packet must not do so.

## Implementation evidence

The delivered fixture packet contains five version-1 synthetic tenants using a
single visible fixture clock: high-activity/healthy, distressed, stalled,
missing-sources, and future-timestamps. The test-only adapter preserves the
current attention formula and overdue-task floor, projects current
`normal`/`stable` missing-source defaults while separately flagging their
missing inputs, records source freshness, and filters each query-family branch
by tenant ID. Expected scores and branch counts are hand-authored snapshots in
the manifest rather than values generated by the assertion helper itself.

The harness is intentionally a characterization oracle, not a local
reimplementation claim for the hosted SQL views. Hosted view execution,
production source coverage, and any future unknown-state guardrail remain
outside this packet and require their stated H0/H1 decisions.

## Explicit non-goals

- no change to burn-risk or retention defaults;
- no stage-health, forecast, cron, view, RPC, RLS, grant, schema, or data fix;
- no production-data export or fixture copied from production;
- no health-score redesign or H1 metric approval;
- no claim that the existing dashboard formula is a valid health oracle; and
- no substitute for RBAC v6 authorization or Client Health privacy tests.
