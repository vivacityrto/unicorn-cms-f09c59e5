# P3-A Main Dashboard legacy-health read retirement

**Date:** 2026-09-08
**Author:** Codex
**Scope:** Phase 2.6 P3-A item 1 follow-up

## Decision

Retire the obsolete Main Dashboard reads of the legacy stage-health contract.
The page already renders the approved `LegacyStageHealthUnavailable` state, so
fetching `v_dashboard_attention_ranked.worst_stage_health_status` and calling
`rpc_portfolio_client_health()` added no user-visible value and continued to
touch a metric explicitly withdrawn by H0.0.

## Change

`src/pages/MainDashboard.tsx` now keeps the unavailable panel and badge but no
longer performs either health query. A regression test asserts that both query
contracts remain absent from the page source. The database RPC, views and
snapshot table were not dropped or modified by this change.

## Safety and verification

- No schema, RLS, RPC, cron, Edge Function or production-data change.
- Existing task, KPI, broadcast, message and calendar reads are unchanged.
- Ask Viv and Compliance Assistant attention consumers remain operational
  attention inputs, not Client Health evidence; their replacement is a later
  contract packet.
- Required static and browser verification is recorded on the implementation
  PR. No write-capable path was invoked.
