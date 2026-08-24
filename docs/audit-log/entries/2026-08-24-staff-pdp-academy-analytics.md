# Audit: 2026-08-24 — staff PDP and Academy analytics

**Trigger:** ad-hoc — implementation of the Staff PDP, Academy Activity, and My PDP improvement plan.
**Scope:** one tenant-scoped read-only analytics RPC, its authorization gate, and the consuming client-portal dashboard. Existing PDP tables, RLS policies, and Academy completion triggers were inspected but not changed.

## Findings

- The existing `get_tenant_academy_staff_stats(bigint)` RPC provides staff-level totals but no course funnel, completion-time, or weekly trend data.
- Academy completion already creates PDP evidence through existing triggers, so the first My PDP improvement can use current evidence and cycle data without a backfill.
- Analytics must be formative and explainable; the new RPC returns calculation definitions alongside metrics and uses descriptive activity rules.

## KB changes shipped

- no changes

## Code changes (if this entry accompanies one)

- current feature branch: add tenant-scoped Academy analytics RPC, client dashboard consumption, and My PDP actionable insights.

## Decisions

- Use a JSONB read-only RPC for the first analytics contract so course and trend metrics can evolve without adding a table or breaking generated frontend types.
- Authorize the same full-access tenant contacts and Vivacity internal roles as the existing tenant Academy staff stats RPC.
- Do not introduce predictive performance scores; surface observable activity and completion states only.

## Open questions parked

- Course-level trend filtering and export can follow once the dashboard has real usage data.
