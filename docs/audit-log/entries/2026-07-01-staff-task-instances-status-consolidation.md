# Audit: 2026-07-01 — staff-task-instances-status-consolidation

**Trigger:** Follow-up to `2026-07-01-stage-status-consolidation` (D4 deferred item). `staff_task_instances.status` had the same class of problem as `stage_instances.status` — non-canonical text values and an unreliable column default.
**Author:** Carl / Claude Code session
**Scope:** Phases SA–SG. `client_task_instances` deferred (different shape — integer-only status column, separate future work).
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0 prod

---

## Findings

- `staff_task_instances.status` had 1,630 rows with value `'Not Started'` (capitalised, space-separated) — written by `start_client_package`, `repair_package_instance_stages`, `publish_stage_version` (both overloads), and `useClientPackageInstances.tsx` `STAFF_TASK_STATUS_MAP`. Column DEFAULT was also `'Not Started'`, making every bare INSERT produce a non-canonical row.
- Unlike `stage_instances`, `status` and `status_id` were **in sync** on all rows. No numeric-as-text corruption. No view rewrites needed.
- `complete_audit_stage_tasks` wrote `status = 'complete'` (singular, no `status_id`) to child `staff_task_instances` rows. Zero such rows existed at audit time (latent writer only).
- `publish_stage_version(integer, text)` had a **divergent body** from the bigint overload: used the deprecated `stage_documents` junction instead of `documents.stage` and did not write `document_instances`. Redirected to the bigint overload as part of Phase SB — aligning legacy callers with project standard.
- `supabase/functions/import-unicorn1-client/index.ts` writes only `stafftask_id` and `stageinstance_id` to `staff_task_instances` — both `status` and `status_id` fall through to column defaults. Safe under the new trigger + CHECK.
- No views select from `staff_task_instances`. No equivalent of the six broken views from the stage_instances migration.
- `trg_update_event_conducted_date` fires on `staff_task_instances.status_id` changes and reads `status_id IN (2, 4)` — this is **correct** (2=completed, 4=core_complete per `dd_status`). Left unchanged per SD-4.

---

## What shipped (Phases SA–SG)

| Phase | What | Notes |
|---|---|---|
| SA | `useClientPackageInstances.tsx` `STAFF_TASK_STATUS_MAP` fixed to canonical lowercase text | `'Not Started'` → `'not_started'` etc. |
| SB+SC | 5 RPCs rewritten (`start_client_package`, `repair_package_instance_stages`, `publish_stage_version` ×2, `complete_audit_stage_tasks`); column DEFAULT changed to `'not_started'` | `publish_stage_version(integer)` now delegates to bigint overload |
| SD | 1,630 `'Not Started'` rows backfilled to `'not_started'`; snapshot in `archive.staff_task_instances_status_backfill_20260701` | 24h soak confirmed 0 new bad rows before SE |
| SE | Invariant trigger `trg_staff_task_status_normalize` (BEFORE INSERT/UPDATE); CHECK constraint `chk_staff_task_instances_status_valid` validated across all 71,160 rows | Trigger auto-resolves missing side from `dd_status`; rejects mismatches |
| SF | `import-unicorn1-client` edge function audited — no patch needed (uses column defaults) | — |
| SG | All verification checks passed | — |

---

## Design decisions confirmed

- **SD-1**: `status_id` kept on `staff_task_instances` — reliable, used by existing trigger.
- **SD-2**: CHECK constraint added.
- **SD-3**: Invariant normalization trigger added.
- **SD-4**: `trg_update_event_conducted_date` left unchanged.
- **SD-5**: `client_task_instances` deferred.

---

## KB changes shipped

- No KB docs updated this session.

## Codebase observations

- `unicorn-cms-f09c59e5` @ `ba57da25`: Phases SA–SE migrations and frontend patch on `main`.

---

## Decisions

- `publish_stage_version(integer, text)` now delegates to the bigint overload — confirmed intentional behaviour upgrade, aligns with documented `documents.stage` standard.
- `blocked` (code 5) and `closed` (code 7) are excluded from the CHECK constraint. Any writer attempting these values on `staff_task_instances` will fail with `23514`. Zero such rows exist; no known writers use them. If needed, widen the CHECK.

---

## Open questions parked

- **`client_task_instances`**: integer-only `status` column (no text column). Inconsistent with the rest of the codebase but not broken. Treat as separate future work if a text migration is ever warranted.
- **`blocked` / `closed` in CHECK**: if the membership module or tenant-lifecycle ever needs to write these to `staff_task_instances`, the CHECK will need widening. Flagged here so it's discoverable.
- **`trg_update_event_conducted_date`**: still reads `status_id` — correct for now (SD-4), but should be revisited if `status_id` is ever dropped from this table in a future cleanup.

---

## Tag

`audit-2026-07-01-staff-task-instances-status-consolidation`
