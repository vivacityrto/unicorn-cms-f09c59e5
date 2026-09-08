# Pause the nightly stage-health cron

**Date:** 2026-09-07

**Packet:** Phase 2.6 stabilization Packet P3-A item 1 (H0.0 containment)

**Scope:** production cron schedule only — no table, RLS, or function changes

**Hosted state changed:** yes — schedule only

## Decision

Carl explicitly authorized pausing the nightly stage-health cron: "the
client health will be superseded by the new client health plan, so you can
stop the cron." This resolves the one open decision the H0.0 packet flagged
as blocking (`docs/kb/reference/client-health-activity-analytics-plan-2026-09-03.md`
§10, H0.0: "Carl must explicitly decide whether the faulty stage cron
continues temporarily for forensic continuity or is paused. Implementation
must not infer that operational decision.").

The underlying metric is documented as known-defective: all 337,272
observed `stage_health_snapshots` rows have `progress_percentage = 0` while
the active-client cohort is overwhelmingly labelled critical, and staleness
is derived from stage-row timestamps rather than real tenant activity (see
the plan doc §1 "Executive decision" and §5 "Live findings"). It will be
replaced by the new client-health plan rather than kept running.

## Implementation

`supabase/migrations/20260907140000_pause_stage_health_monitor_cron.sql`
(applied as Supabase migration `20260907121616_pause_stage_health_monitor_cron`):

- no-ops when `pg_cron` is unavailable;
- refuses to act if job ID 15 has been reused by another job;
- unschedules only `run-stage-health-monitor-nightly`; and
- raises if that job name remains scheduled afterward.

This migration **only** unschedules the cron trigger. It deliberately does
not drop the `run-stage-health-monitor` Edge Function (still invocable
manually) or the `stage_health_snapshots` table/rows, which are retained as
raw evidence per H0.0's "retain the operational triage workflow and raw
evidence links" requirement.

The migration was allowlisted in `supabase/migration-safety-allowlist.json`
(entry `p3a-h00-pause-stage-health-monitor-cron`, expires 2026-10-07) because
it intentionally changes hosted scheduling.

## Postflight

- `cron.job` no longer contains job ID 15 / `run-stage-health-monitor-nightly`.
- 23 active jobs remain (was 24 before this change).
- No other job's schedule was touched.
- `stage_health_snapshots` and the `run-stage-health-monitor` Edge Function
  are unchanged.

## Open questions parked

- Whether/when to fully retire `run-stage-health-monitor` and
  `stage_health_snapshots` is a separate decision, out of scope here — H0.0
  explicitly only asks to contain the misleading signal, not delete the
  evidence trail.
