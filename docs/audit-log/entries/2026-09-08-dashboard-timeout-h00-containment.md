# Fix dashboard timeout by extending H0.0 containment to two views

**Date:** 2026-09-08

**Packet:** Phase 2.6 stabilization Packet P3-A item 2 (dashboard timeout), L10 item #26

**Scope:** two production view definitions (`CREATE OR REPLACE VIEW`) — no table, RLS, function, or data changes

**Hosted state changed:** yes — view definitions only

## Decision

Carl explicitly authorized applying the same H0.0 containment decision
(2026-09-07 — "show unavailable wherever the invalid stage-health metric
is consumed, do not relabel it as trustworthy") to two dashboard views,
after the dashboard timeout (L10 #26 — Attention Ranking, Priority Inbox,
Behavioural Prompts, and Labour Efficiency all returning HTTP 500 in
production) was root-caused to this exact data.

**Root cause, confirmed via `EXPLAIN (ANALYZE, BUFFERS)` against the
real, authenticated-role query shape** (not a superuser bypass): 97% of
query time (1100ms of 1129ms total) was spent in a per-tenant `DISTINCT
ON (stage_instance_id) ... ORDER BY stage_instance_id, generated_at DESC`
scan of `stage_health_snapshots` inside `v_dashboard_tenant_portfolio`'s
`sh` LATERAL join, scanning ~1,987 historical rows per tenant to compute
`worst_stage_health_status`/`critical_stage_count`/`at_risk_stage_count`.
This is the exact same table H0.0 already flagged as known-defective (all
337,272 rows have `progress_percentage = 0`) and already paused the
generating cron for (`docs/audit-log/entries/2026-09-07-pause-stage-health-monitor-cron.md`)
— the view had simply never been updated to match that containment
decision. A second, independent instance was found in
`v_dashboard_priority_inbox`: an un-tenant-scoped, global `DISTINCT ON`
scan of the same table generating "Stage health: critical/at_risk" inbox
items.

Not fixed by adding an index — an index cannot make a `DISTINCT ON` over
genuinely duplicative historical snapshot data cheap; the real problem is
computing anything from data already decided to be untrustworthy.

## Implementation

`supabase/migrations/20260908030000_dashboard_stage_health_h00_containment.sql`
(two `CREATE OR REPLACE VIEW` statements, output column names/types
unchanged in both so all downstream consumers keep working):

1. **`v_dashboard_tenant_portfolio`**: the `sh` LATERAL join no longer
   scans `stage_health_snapshots`. It's now a fixed stub
   (`worst_health := 'unavailable'`, `critical_count := 0`,
   `at_risk_count := 0`) with a comment pointing at the new client-health
   plan as the intended eventual replacement. Every other LATERAL join in
   this view (risk, tasks, gaps, consult hours, burn forecast, retention
   forecast) is untouched.
2. **`v_dashboard_priority_inbox`**: removed the `stage_health` `UNION
   ALL` branch entirely. The other 6 branches (risk alerts, evidence
   gaps, burn risk, retention risk, regulator changes, playbook
   suggestions) plus the overdue-compliance sub-view are untouched.

`v_dashboard_attention_ranked`, `v_dashboard_behavioural_prompts`, and
`v_dashboard_labour_efficiency` were not modified directly — all three
read from `v_dashboard_tenant_portfolio`, so they inherit the fix and the
performance win without their own changes.

**Frontend containment superseded by a concurrent, more complete fix.**
`AttentionRankingSection.tsx`, `ExpandablePortfolioSection.tsx`, and
`TenantDrawer.tsx` originally had a fallback that silently rendered any
unrecognized `worst_stage_health_status` value as a green "Healthy"
badge — exactly the "relabeled as trustworthy" outcome H0.0 said not to
do. This PR initially added an explicit `unavailable` entry to each
component's badge/color map to fix that, but while resolving a merge
conflict against `origin/main` it turned out Codex had independently
shipped a more thorough fix to the same three files in the same session
window (`d11c2c3cb`, "fix: contain invalid legacy health outputs"): a
shared `LegacyStageHealthUnavailable` component that renders
"Unavailable — data repair in progress" **unconditionally**, regardless
of the backend value, replacing the badge/color maps entirely (also
updating the "Low Attention" section's copy, which this PR hadn't
touched). Took Codex's version as-is rather than layering a second,
redundant containment mechanism on top — it's fully compatible with
this PR's backend fix (it doesn't inspect the value at all) and is the
better implementation. This PR's own frontend badge-map edits were
discarded during the merge.

`stage_health_snapshots` itself (the raw table) and the
`run-stage-health-monitor` Edge Function remain completely untouched —
both stay in place as evidence, per H0.0's original instruction.

## Disclosed side effect (not a bug)

`useDashboardTriage.ts`'s "low attention" bucket requires
`worst_stage_health_status === 'healthy'`, and its "Critical stages"
Today's Focus auto-item requires `=== 'critical'`. With every tenant now
`'unavailable'`, neither condition is ever true — no code change was
needed (both fall through to their existing empty-result behavior
safely), but the practical effect is: the low-attention bucket empties
out (everyone moves to the active portfolio view instead) and no
stage-health-derived Focus items generate, until the new client-health
plan restores a real signal for this dimension. This is the correct
behavior per H0.0's own principle — assuming "healthy" or "critical" from
data already known to be wrong would be worse than showing nothing.

## Postflight

- `EXPLAIN (ANALYZE, BUFFERS)` on the exact previously-timing-out query
  shape (`assigned_csc_user_id = <real value> AND tenant_status =
  'active'` against `v_dashboard_attention_ranked`): **13.9ms**, down from
  1129.6ms — an ~81x improvement, well clear of both the 3s (`anon`) and
  8s (`authenticated`) `statement_timeout`.
- `v_dashboard_priority_inbox` (`select * ... limit 500`): **12.0ms**, no
  `stage_health_snapshots` scan anywhere in the plan.
- Neither `stage_health_snapshots` nor any other table had rows touched —
  this is a view-definition-only change.

## Open questions parked

- The new client-health plan (referenced throughout H0.0) is expected to
  eventually replace the `'unavailable'` stub in
  `v_dashboard_tenant_portfolio` with a real, trustworthy signal — not
  scoped or implemented here.
- Whether/when to fully retire `stage_health_snapshots` and
  `run-stage-health-monitor` is unchanged from H0.0's original
  disposition — still a separate, later decision.
