# Client Health H0.0 containment — 2026-09-07

## Status

Implemented in the M4 stabilization worktree; production deployment and the
authenticated read-only browser pass are still pending.

## Evidence

The known-defective legacy `stage_health_snapshots` signal is no longer shown
as Healthy, At Risk, Critical, Excellent, or Good on the affected frontend
surfaces. A shared `LegacyStageHealthUnavailable` state is used by the
executive portfolio widget, the main dashboard client-health panel, triage
ranking/full-portfolio rows, tenant drawer, and the stage-health filter. The
triage route remains reachable and continues to expose non-health operational
signals (tasks, gaps, risk, renewal, and activity) for the interim workflow.

The Ask Viv `get_stage_health_hotspots` tool now returns the generic
`unavailable / data_repair_in_progress` result and directs callers to raw
task/risk/gap/activity/deadline tools. It does not reveal authorization or
hidden-source details.

Jobs 14 (`run-workload-forecast`) and 15 (`run-stage-health-monitor`) now emit
`output_health` counts and return HTTP 503 when writes fail or input/output
counts do not reconcile. Static regression tests cover these guardrails.

## Verification

- `npm run typecheck`: passed (app and node projects).
- Targeted Vitest: 1 file, 2 tests passed.
- Edge test suite: 265 passed, 0 failed, including the new output-health tests.
- `npm run lint:ratchet`: no regressions reported for the changed frontend files;
  the run is retained as a worktree command result pending the full CI check.
- No production database writes or Edge deployments were made for M4.

## Follow-up

Complete the authenticated read-only Playwright pass for `/dashboard`,
`/executive`, `/triage-dashboard`, and the Ask Viv surface. Decide separately
whether forecast jobs 20/21 are repaired or unscheduled, then deploy the
approved Edge changes and re-check freshness/non-zero-output evidence.
