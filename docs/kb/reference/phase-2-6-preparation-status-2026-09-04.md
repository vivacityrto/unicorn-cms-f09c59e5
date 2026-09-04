# Phase 2.6 preparation status

**Checkpoint:** `origin/main` at `dd083ece` (PR #593)

This is a preparation-only checkpoint. No runtime, schema, RBAC, tenant,
RLS, RPC, Edge, or database behavior was changed.

## Completed preparation

- Task-dialog characterization is recorded in
  [`phase-2-6-task-dialog-characterization-2026-09-04.md`](phase-2-6-task-dialog-characterization-2026-09-04.md)
  and merged in PR #593.
- Three-seat council sequencing is recorded in the optimization plan and
  shared `MEMORY.md`.
- A fresh dependency install completed under `UNICORN-PHASE-LOCK` so route
  tooling can run without competing with Claude's workload.
- The AST route manifest was regenerated from this branch cut: 1,100 files
  scanned, five route-bearing files, 243 routes, and zero duplicate paths.

## Current architecture baseline

`node scripts/architecture-metrics.mjs --json` at this checkpoint reports:

- 1,735 tracked product files;
- 492,365 physical lines;
- 418,901 lines excluding generated Supabase types;
- 408,191 product lines excluding generated types and tests;
- 117 files over 600 lines and 33 over 1,000 lines;
- 7 wrapper files / 116 lines;
- 2,881 raw `any` keyword hits;
- Supabase imports: 107 pages / 223 components / 271 hooks;
- direct Supabase calls: 95 pages / 177 components / 240 hooks;
- 12 Zod-adoption files and 160 `unicorn_role` files.

The metrics differ from the earlier #588 checkpoint because Claude's package-
builder batches (#590 and #592) landed afterward. Compare future snapshots by
script, branch-cut SHA, and exclusions—not by the older ad-hoc totals.

## Blockers and next actions

### Blocking implementation

Claude's Phase 2.5 exit checkpoint is not yet recorded as a completed phase.
The task-dialog implementation must wait for the final Phase 2.5 baseline,
full verification contract, and Playwright evidence. This is a sequencing gate,
not a code or environment failure.

### Safe parallel work

1. Monitor Claude's remaining Phase 2.5 PRs and reconcile their final baseline
   and deferred-findings list against the optimization plan.
2. Keep the task-dialog parity plan ready: create/edit, validation, date
   offsets (including the existing absolute-value behavior), reset/close,
   failure toasts, client/staff labels, and UUID edit IDs.
3. Continue read-only RBAC v6 and tenant P0 characterization. Do not publish
   a new permission surface or alter tenant authority.
4. Prepare evidence packets for the title-extraction pair,
   `useStageQualityCheck`, and the SeatCard presentation extraction.
5. Re-run route/import/metrics snapshots after Claude's exit checkpoint before
   creating the first runtime consolidation branch.

## Implementation gate

When Phase 2.5 is formally closed, create one fresh Phase 2.6 worktree from
the latest `origin/main` and implement only the task-dialog cohort. Preserve
separate `package_client_tasks` and `package_staff_tasks` adapters and the
ordinary `ProtectedRoute` behavior. Any RBAC, tenant-scope, schema, RLS, RPC,
trigger, grant, or Edge-contract discovery moves to a separately scoped
vertical slice.
