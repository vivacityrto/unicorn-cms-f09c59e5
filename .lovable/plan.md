# Phase H — Closed (Option B)

No DDL. The table stays.

## Decision

`client_package_stage_state` is retained as the **membership module's canonical stage-state table**, separate from `stage_instances` (the generic package flow).

The original "12 rows, never updated, no readers" basis for archiving was wrong — H1 audit found active writers, readers, 11 dependent views, and 2 FKs.

## Documentation to save

I'll write a single memory file capturing the split so future sessions don't re-propose archiving.

**`mem://infrastructure/stage-state-table-split`** (type: feature)

> Two stage-state tables coexist by design — do not consolidate.
>
> - **`public.stage_instances`** — generic package flow. Canonical text `status` (Phases A–G migration). Read by `v_client_package_*`, `v_phase_progress_summary`, `get_client_package_dashboard`, `fn_check_phase_gate`, `fn_close_phase_instance`.
> - **`public.client_package_stage_state`** — membership module. Written via `transition_stage_state` RPC. FK targets: `membership_entitlements.current_stage_state_id`, `stage_state_audit_log.stage_state_id`. Read by `calculate_compliance_score`, `get_stage_progress`, `get_membership_rollups`, `merge_tenants`, and 11 views (`v_score_*`, `v_exec_*`, `v_momentum_state`, `v_phase_actions_remaining`, `v_dashboard_weekly_wins`, `v_predictive_signal_inputs`, `v_completion_eligibility`, `v_progress_anchor_inputs`).
>
> **Do not archive `client_package_stage_state`.** Phase H was closed 2026-06-30 after audit (Option B). If membership ever migrates onto `stage_instances`, that is a multi-phase module migration, not a cleanup.

Index entry to add under `## Memories`:

```
- [stage-state-table-split](mem://infrastructure/stage-state-table-split) — Two stage-state tables by design: stage_instances (generic) vs client_package_stage_state (membership)
```

## What runs on approval

1. Write `mem://infrastructure/stage-state-table-split` with the content above.
2. Append the index entry to `mem://index.md`.

Nothing else. No SQL, no code changes.
