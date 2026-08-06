# Audit: 2026-07-01 — stage-status-consolidation

**Trigger:** Ad-hoc — stage progress bars showing wrong counts on active client packages (tenant 7505: 1/10; tenant 7512: 0/7 in admin vs 6/8 in client portal).
**Author:** Carl (investigation) / Claude Code session
**Scope:** Full audit and consolidation of `stage_instances.status` / `status_id` inconsistency. Phases A–G shipped. Phase H deferred (see open questions).
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0 prod

---

## Findings

- `stage_instances.status` (text) and `stage_instances.status_id` (int → `dd_stage_state`) were never reconciled after the enum-to-dd Phase 1B migration (14 May 2026). `dd_stage_state` was seeded from the old enum (`active`, `complete`, `not_applicable`) but the app had already adopted different text values (`in_progress`, `completed`, `na`).
- The real UI codebook is `dd_status` (codes 0–6: `not_started`, `in_progress`, `completed`, `na`, `core_complete`, `blocked`, `monitor`). `dd_stage_state` was orphaned — no frontend file imported it, no FK enforced it.
- 73 legacy-numeric rows (`'0'`–`'6'`) existed in `stage_instances.status`, written by `PackageStagesManager.tsx` which was writing a numeric dd_status code into a text column.
- Six views (`v_client_package_dashboard`, `v_client_package_stages`, `v_admin_zero_progress_packages`, `v_client_dashboard_progress`, `v_client_home_feed`, `v_phase_progress_summary`) and `get_client_package_dashboard` all used `status_id IN (2, 3)` as the "complete" predicate — mapping to "Active" and "Blocked" in dd_stage_state, not "Completed". This caused admin to show 0/7 and client portal to show 6/8 for the same package (different code paths reading different columns).
- `fn_check_phase_gate` and `fn_close_phase_instance` used same broken predicate.
- `complete_audit_stage_tasks` wrote `'complete'` (singular); `start_client_package` and `repair_package_instance_stages` wrote `'Not Started'` (capitalised) with `status_id = 0`.
- `tenant-lifecycle` edge function read a mixed filter `['not_started','in_progress','1','3']` that would have silently stopped working after the backfill.
- `CREATE OR REPLACE VIEW` in Phase D reset `security_invoker=true` on all six views — caught and re-applied by Lovable before the migration landed.
- Phase H pre-check found `client_package_stage_state` is NOT a stale table — actively used by the membership module with 5 RPCs, 11 views, and 2 FK-bearing tables. The Phase B interim note "12 rows, no readers" was wrong. See open questions.

---

## What shipped (Phases A–G)

| Phase | What | Notes |
|---|---|---|
| A | Frontend writers: `PackageStagesManager`, `useClientPackageInstances`, `useClientTaskInstances`, `useStaffTaskInstances` | Write canonical text via dd_status.value; drop status_id writes; dual-read shim for legacy rows |
| B | RPCs: `complete_audit_stage_tasks`, `start_client_package`, `repair_package_instance_stages`; edge fn `tenant-lifecycle` L274; `dd_status` seeded with `closed` (code 7, seq 5) | All writers now produce canonical text |
| C | Data backfill: 73 legacy-numeric rows migrated to canonical text; full 6,175-row snapshot to `archive.stage_instances_status_backfill_20260630` | Single transaction with 5 in-transaction guards |
| D | Six views + `get_client_package_dashboard` + `fn_check_phase_gate` + `fn_close_phase_instance` rewritten to D2 two-set logic | Not-blocking: `('completed','core_complete','na')`; genuinely-done: `('completed','core_complete')` |
| F | CHECK constraint `chk_stage_instances_status_valid` on `stage_instances.status` | `NOT VALID` + `VALIDATE` in same transaction |
| G | Drop `idx_stage_instances_status_id`; null `status_id`; archive `dd_stage_state`; drop `status_id` column | `dd_stage_state` → `archive.dd_stage_state`; rollback via Phase C snapshot |
| H | DEFERRED — `client_package_stage_state` retained (see open questions) | — |

---

## Design decisions confirmed

- **D1**: `dd_status` adopted as canonical codebook; `dd_stage_state` retired to `archive` schema.
- **D2**: Two completion sets — "not blocking" `('completed','core_complete','na')` for progress bars; "genuinely done" `('completed','core_complete')` for zero-progress detection.
- **D3**: `status_id` column dropped.
- **D4**: `staff_task_instances` status consolidation deferred to a separate session.
- **OD-1**: `closed` added to `dd_status` as code 7 / seq 5 to cover `tenant-lifecycle` writer.
- **OD-2**: Phase C snapshot covers all 6,175 rows.
- **OD-3**: CSCs for Wyatt Education Group and Win The Tender Or Grant briefed before Phase D shipped (portal stage counts shifted).
- **OD-4**: Phase G (column drop) run immediately — no off-peak wait given table size and full consumer cleanup.

---

## KB changes shipped

- No KB docs updated this session — `unicorn-kb/codebase-state/` may need a note on the two-table stage-state architecture (see open questions).

## Codebase observations

- `unicorn-cms-f09c59e5` @ `56906d6e`: Phase A–G migrations and frontend patches on `main`. Includes the security_invoker re-application on the six Phase D views.

---

## Decisions

- `client_package_stage_state` is the membership module's canonical stage-state table; `stage_instances` is the generic package flow. Both coexist by design. See open questions.

---

## Open questions parked

- **`staff_task_instances.status_id`** has the same broken-codebook problem as `stage_instances.status_id` did. Deferred per D4. Needs a dedicated session — the trigger `trg_update_event_conducted_date` (on `staff_task_instances`) also needs review at that time.
- **`client_package_stage_state` / membership module**: Phase H closed (Option B). If membership ever migrates onto `stage_instances`, that is a multi-phase module migration. Do not archive the table. The 5 RPCs (`transition_stage_state`, `calculate_compliance_score`, `get_stage_progress`, `get_membership_rollups`, `merge_tenants`) and 11 dependent views remain on the legacy table.
- **KB doc for two-table stage-state architecture**: consider adding a `unicorn-kb/codebase-state/` doc clarifying the split so future sessions don't re-propose archiving `client_package_stage_state`.
- **`v_admin_zero_progress_packages` semantic tightening**: N/A stages no longer count toward zero-progress detection (D2). Tenants whose only "done" stages are N/A will now correctly appear in zero-progress monitoring. CSCs should expect an uptick in that report post-Phase D.

---

## Tag

`audit-2026-07-01-stage-status-consolidation`
