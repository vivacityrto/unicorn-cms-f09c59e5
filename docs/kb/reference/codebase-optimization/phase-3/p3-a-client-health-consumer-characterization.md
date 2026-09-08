# P3-A Client Health Consumer Characterization

> **Status:** implementation evidence for Phase 2.6 P3-A item 1
>
> **Date:** 2026-09-08
>
> **Code baseline:** `origin/main@14b3a713b`
>
> **Scope:** identify every remaining consumer of the retired stage-health
> contract, contain the obsolete Main Dashboard reads, and define the next
> safe replacement boundary. This document authorizes no schema, RLS, RPC,
> metric-definition, production-data, or cron change.

## Result

The direct `/dashboard` health reads were dead after H0.0 containment: the
screen already renders `LegacyStageHealthUnavailable`, but `MainDashboard`
still fetched `v_dashboard_attention_ranked.worst_stage_health_status` and
called `rpc_portfolio_client_health()`. This packet removes those reads, keeps
the panel explicitly unavailable, and adds a source-level regression test.

The remaining consumers are not equivalent and must not receive one blanket
replacement:

- the triage views still provide attention/task/risk/gap data, with their
  stage-health fields fixed to `unavailable` by the H0.0 migration;
- Ask Viv and Compliance Assistant consume the attention view for operational
  attention facts, not a validated health score;
- the database RPC remains retained for compatibility but has no frontend
  caller after this change; and
- the stage-health and forecast Edge Functions remain separate operational
  objects for a future replacement/retirement decision.

## Evidence and consumer matrix

| Consumer | Current source | Health-derived behavior | Current disposition | Next safe action |
|---|---|---|---|---|
| `/dashboard` `MainDashboard.tsx` | `v_dashboard_attention_ranked` and `rpc_portfolio_client_health()` | Counted `worst_stage_health_status` into Mine/Portfolio donut | **Contained in this packet:** no query; static unavailable panel | Replace only after H1 metric contract and confidence semantics are approved |
| `/executive` `PortfolioHealthWidget.tsx` | Previously `stage_health_snapshots` | Converted raw snapshots into healthy/at-risk/critical percentages | **Already contained:** explicit unavailable state; no table query | Reconnect to a versioned Client Health projection, not the legacy table |
| `/triage-dashboard` `useDashboardTriage.ts` and `Dashboard.tsx` | `v_dashboard_attention_ranked`, priority inbox, behavioural prompts, labour efficiency | Attention score and filters include stage fields; low-attention and critical-stage focus branches now never match `unavailable` | **Contained by M4/P3-A item 2:** portfolio view stubs stage fields to `unavailable`; priority-inbox stage branch removed; UI renders unavailable | Keep non-health attention drivers separate; remove legacy stage filters only with route/product decision |
| Staff Ask Viv `get_portfolio_attention` | Shared `portfolio-facts.ts` over `v_dashboard_attention_ranked` | Returns attention score, overdue tasks, staleness, burn/retention and risk; stage score contributes `0` after H0.0 stub | **Retained as attention evidence, not health**; prompt warns against legacy health labels | Characterize each driver’s coverage/freshness before mapping into Client Health |
| Staff Ask Viv `compare_clients` | `ask-viv-assistant/index.ts` over `v_dashboard_attention_ranked` plus audit schedule | Compares attention/risk/task/staleness/burn/renewal; no stage label selected | **Retained as operational comparison** | Add explicit `unknown`/coverage fields in a separately reviewed contract |
| Compliance Assistant portfolio path | `buildPortfolioFacts()` via shared fact builder | Same attention facts are passed to deterministic/LLM reasoning | **Retained but not authoritative health**; no numerical health claim is allowed | Require the H1 metric catalogue and confidence/provenance fields before new health facts |
| `get_stage_health_hotspots` | Ask Viv tool handler | Would have exposed legacy stage labels | **Already contained:** returns `unavailable/data_repair_in_progress` | Do not restore until replacement projection is live and tested |
| `rpc_portfolio_client_health()` | `SECURITY DEFINER` database function over attention view | Aggregates four legacy stage labels | **Retained database object; no caller after this packet** | Drop or repurpose only in an explicit schema/RBAC packet after dependency scan |
| `run-stage-health-monitor` | `stage_health_snapshots` writer | Writes the defective snapshot stream | Cron paused; function/table retained as evidence | Decide replacement/retirement with Client Health H1/H2; no deletion here |
| `run-workload-forecast`, `risk-command-engine`, `strategic-orchestration` | Snapshot/forecast reads in Edge code | May consume legacy stage snapshots in write-capable or operational paths | **Out of scope:** not UI-only consumers | Inventory deployed callers and contracts before any change |

## Legacy-to-Client-Health mapping

The old attention view mixes several concepts that the Client Health plan
explicitly separates:

| Legacy field/family | Client Health interpretation | Decision |
|---|---|---|
| `worst_stage_health_status`, `critical_stage_count`, `at_risk_stage_count` | Proposed compliance/progress signal | **Unknown** until status-domain and coverage defects are repaired |
| `mandatory_gaps_count`, `overdue_tasks_count`, `open_tasks_count` | Compliance delivery and commitment signals | Candidate inputs, but require authoritative task ownership/status semantics |
| `risk_status`, `risk_index` | Risk dimension | Candidate input; document source freshness and missing behavior |
| `last_activity_at`, `days_since_activity` | Relationship/cadence signal | Not sufficient alone; distinguish client participation from staff work |
| `consult_hours_30d` | Service capacity/execution signal | Candidate input; stratify by package/lifecycle and billable semantics |
| `burn_risk_status`, `retention_status` | Lifecycle/commercial risk | Current forecast tables are empty/stale; return unknown rather than stable |
| `attention_score` | Consultant attention queue | **Never relabel as health**; preserve component drivers and urgency |

The Client Health plan requires each future dimension to carry score/status,
observed and expected values, trend/freshness, provenance, confidence,
coverage, missing reason, contribution and explanation. None of the current
legacy consumers supplies that complete contract.

## Verification and safety boundary

- The packet changes only `MainDashboard.tsx` and its regression test; it does
  not change a database object or production data.
- The regression test proves the page cannot reintroduce either retired health
  query and still renders the explicit unavailable component.
- No live Playwright write path is involved. The affected page is already
  covered by the existing authenticated read-only dashboard harness; a focused
  read-only pass is required at PR handoff if the dev server/persona is
  available.
- The next P3-A packet should be a read-only contract/coverage characterization
  for the Ask Viv and Compliance Assistant paths, followed by a separately
  approved Client Health H1 projection. It must not revive the legacy cron or
  silently reinterpret `attention_score` as health.
