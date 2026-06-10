## Scope
Refactor `supabase/functions/run-stage-health-monitor/index.ts` to eliminate N+1 queries. Replace per-stage loop (4 DB calls × N stages) with 6 bulk upfront queries + an in-memory loop.

## Changes

### File: `supabase/functions/run-stage-health-monitor/index.ts`

Replace lines 47–175 (current steps 3–4) with the batch approach provided in the user spec:

1. **Step 3** — Collect unique `packageInstanceIds` and `stageIds` from `stages`.
2. **Step 4** — One bulk fetch of `package_instances` → build `tenantByPkg` Map; derive unique `tenantIds`.
3. **Step 5** — One bulk fetch of `staff_task_instances` filtered by `stageinstance_id IN (stageIds)`; group into `tasksByStage` Map.
4. **Step 6** — One bulk fetch of `risk_events` filtered by tenant + severity=high + status IN (open, monitoring); count per tenant into `riskCountByTenant` Map.
5. **Step 7** — One bulk fetch of `evidence_gap_checks` for all `stageIds` ordered by `generated_at` desc; keep first per stage into `latestGapByStage` Map.
6. **Step 8** — One bulk fetch of `time_entries` (last 90 days) for all `tenantIds`; sum `duration_minutes/60` into `consultHoursByTenant` Map.
   - Note: changes consult-hour source from `consult_logs` (all-time) to `time_entries` (last 90 days). This matches the user-supplied code.
7. **Step 9** — In-memory loop over `stages` that does zero DB calls; pushes the same snapshot shape into `snapshots[]` and applies the rules engine identically.

Leave unchanged:
- Steps 1–2 (rules + active stage fetch)
- Step 5 batch insert (now renumbered, but code identical)
- Step 6 materialized view refresh
- Response shape

## Verification
- Function completes in <5s regardless of stage count.
- `stage_health_snapshots` row count post-run equals number of active stages with a resolvable tenant.
- Health-status distribution is consistent with prior runs (within expected variance from the consult-hours source change).

## Risk
Low. Logic is preserved; only access pattern changes. The one semantic shift is consult hours now sourced from `time_entries` (last 90d) instead of `consult_logs` (all-time) — per the provided spec.
