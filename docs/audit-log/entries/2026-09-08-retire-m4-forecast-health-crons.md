# Retire the remaining M4 forecast and health cron jobs

- **Date:** 2026-09-08
- **Initiative:** Codebase Optimization, Phase 2.6, Packet M4
- **Decision owner:** Carl
- **Change:** Unschedule production cron jobs 20 and 21:
  `run-tenant-risk-forecast-nightly` and `run-retention-forecast-nightly`.
- **Migration:** `20260908080000_retire_forecast_health_crons.sql`
- **Reason:** Both jobs have executed without producing forecast rows. The
  stage-health and workload schedules (jobs 15 and 14) were already paused or
  retired after H0.0 containment. The replacement metric contract belongs to
  the Client Health program rather than the known-invalid legacy outputs.
- **Safety boundary:** The migration contains no project URL and only removes
  the two exact named schedules, with historical-ID reuse checks and a
  postflight assertion. It does not drop Edge Functions, tables, indexes,
  policies, or any data rows. The retained data is evidence for the replacement
  design; rollback is an explicit, disabled-by-default script requiring an
  operator-approved target URL.
- **Preflight evidence:** Read-only production query on 2026-09-08 confirmed
  jobs 20 and 21 were active at schedules `0 13 * * *` and `0 14 * * *`, and
  that `tenant_risk_forecasts` and `tenant_retention_forecasts` both contained
  zero rows. Jobs 14 and 15 were already absent.
- **Verification required after merge/apply:** confirm both names are absent
  from `cron.job`, neighboring schedules are unchanged, and all retained
  forecast/health tables and Edge Functions still exist.

This closes M4's stabilization lane. Future metric repair or scheduling must
be authorized under the Client Health plan with a new contract, tests, and
audit entry; it must not silently reactivate these jobs.
