# Audit: 2026-08-07 — sync time_entry_allocations on package change

**Trigger:** ad-hoc — Dave reported MCC Adelaide (tenant 6277) M-GR Package Burndown showing over-limit while monthly totals looked correct after he reallocated time to the previous package.
**Scope:** Confirmed root cause in code + live prod data; fixed `fn_reallocate_time_entry` trigger; one-shot data repair of stale single-allocation rows; made Client Time-tab monthly/closed-package summaries allocation-aware. Did not change `allocate_time_entry()`'s active-membership resolution for new inserts / scope splits.

## Findings

- Package Burndown left gauge reads `v_package_burndown` → `time_entry_allocations` (billable, renewal-windowed). Monthly table summed raw `time_entries` by `package_instance_id` and ignored allocations — so the two figures could disagree after any package move.
- `EditTimeDialog` updates `package_instance_id` / `package_id` but never touched allocations. `fn_reallocate_time_entry` only re-ran `allocate_time_entry()` when `scope_tag` or `duration_minutes` changed — never on package change.
- Calling `allocate_time_entry()` on a historical package move would also be wrong: it always targets currently-active memberships via `get_active_membership_packages()`, which would undo a move onto a completed package.
- MCC Adelaide smoking gun (pre-repair): May 12 entries had `package_instance_id = 15132` (closed M-RR) but allocations still pointing at active M-GR `15206` (+4:00 on burndown, missing from monthly); Jun 4 was the inverse (−0:40). Burndown showed 11:00 used / 7:00 included; monthly billable on the entry column was 7:40.
- Blast radius: **334** single-allocation rows disagreeing with their entry's package (**59 billable**, **~102h**), across multiple tenants (Melloz, On The Mark, Australian Academy, Momentum, Adelaide Aviation, etc.). Multi-alloc RTO/CRICOS split rows left alone (intentional).
- `allocation_reason` validator only allows `auto` / `override` / `reallocate` — first apply attempt with custom reason strings failed and rolled back cleanly; retried with `reallocate`.

## KB changes shipped

- No changes.

## Code changes

- Migration `20260807020000_sync_allocations_on_package_change.sql`: replace `fn_reallocate_time_entry` (package-change pin + duration in-place update for matching single allocs); repair UPDATE syncing 334 stale single-alloc rows. Applied to prod Supabase same session via MCP with Carl's explicit approval.
- `src/components/client/ClientTimeTab.tsx`: active Package Burndown monthly breakdown and closed-package summaries now attribute minutes via allocations (fallback to entry package when none).
- Post-repair MCC Adelaide M-GR `15206`: `used_minutes` **460** (7:40) / 420 included — matches monthly billable; 0 remaining single-alloc stale rows prod-wide.

## Decisions

- On explicit package change, pin **100%** of the entry's minutes to the chosen `package_instance_id` (user intent from EditTimeDialog). Do not re-run active-membership split logic for that path.
- Repair follows the entry's `package_instance_id` (Dave's / editors' chosen package), not the stale allocation. For MCC Adelaide that correctly moved May 12 time off the new M-GR bank.

## Open questions parked

- Dual-membership multi-alloc monthly splits are now shown allocation-aware on the Time tab; `rpc_get_package_usage` (Overview card) is still allocation-blind — separate follow-up if it diverges in the wild.
- Non-billable still appears in monthly Total but not in the left burndown gauge by design (2026-06-11 billable-bank policy); not changed here.
