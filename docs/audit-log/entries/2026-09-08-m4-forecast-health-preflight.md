# M4 forecast and health production preflight

**Date:** 2026-09-08  
**Packet:** Phase 2.6 stabilization M4  
**Scope:** read-only production verification; no hosted state changed

## Findings

- `run-stage-health-monitor-nightly` (job 15) is absent after the previously
  authorized H0.0 containment. Its 357,471 `stage_health_snapshots` rows are
  retained as evidence, and none has a non-zero `progress_percentage`.
- `run-workload-forecast-nightly` (job 14, `0 16 * * *`) remains active.
- Production has 2,539 `workload_snapshots` through 2026-09-07, but zero rows
  in `tenant_package_burn_forecast`, `tenant_risk_forecasts`, and
  `tenant_retention_forecasts`; `predictive_operational_risk_snapshots` is
  stale since 2026-02-13.
- The deployed workload and stage-health function sources do not contain the
  merged M4 `output_health`/503 safeguards. No deployment was attempted.

## Decision required

M4 must choose one path for the remaining active workload job:

1. repair and deploy the output contract, then prove it with authenticated,
   read-only Playwright checks; or
2. retire/unschedule the job as part of the Client Health replacement.

No production deployment, data repair, or schedule change is authorized by
this preflight.
