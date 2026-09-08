# Retire the workload forecast cron

**Date:** 2026-09-08  
**Packet:** Phase 2.6 stabilization M4  
**Scope:** production cron schedule only

## Decision

Carl explicitly selected retirement after the M4 preflight found that the
workload job produced snapshots but no burn, tenant-risk, or retention forecast
rows. The Client Health replacement will own future metric design.

## Implementation

`supabase/migrations/20260908060000_retire_workload_forecast_cron.sql` was
applied through Supabase MCP and recorded as migration
`20260908035935_retire_workload_forecast_cron`.

- The migration unscheduled only `run-workload-forecast-nightly` (historical
  job ID 14), with a name/ID reuse guard and postflight assertion.
- The `run-workload-forecast` Edge Function, `workload_snapshots`, and all
  forecast tables were retained for evidence and future replacement work.
- A disabled-by-default rollback script is included; it requires explicit
  session settings and an approved target URL.

## Postflight

- Job ID 14 and the named schedule are absent from `cron.job`.
- `workload_snapshots` remains at 2,539 rows.
- `tenant_package_burn_forecast`, `tenant_risk_forecasts`, and
  `tenant_retention_forecasts` remain at 0 rows.
- No data rows, Edge Function, table, or migration history were deleted.
