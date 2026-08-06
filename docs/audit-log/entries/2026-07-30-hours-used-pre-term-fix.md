# Audit: 2026-07-30 — Hours-used pre-term fix (direct migration)

**Trigger:** direct follow-up to `audit-2026-07-30-package-burndown-view-fix` from earlier the same day — while explaining to Carl why SHCS Academy's package showed "47.75/63 hours used" only weeks after the package started, a second, unrelated DB bug was found in the function that first fix had used as its ground truth.
**Scope:** Fixed 1 confirmed DB bug. No frontend changes in this entry — see `audit-2026-07-30-package-burndown-view-fix` and the earlier hand-applied hotfix for the Client Detail bugs that shipped in the same overall audit session.

## Findings

- `fn_package_used_minutes()` — the canonical function `package_instances.hours_used` is kept in sync with via `trg_recalc_package_hours_used` — had no date floor. It summed every `time_entry_allocations`/`time_entries` row ever pointed at a package instance, with no regard for whether that work was done during that instance's own term.
- Root cause is a data event, not a code bug in the narrow sense: `allocate_time_entry()` always resolves to "whichever RTO/CRICOS package instance is `get_active_membership_packages()` returns right now" — no time-awareness at all. Correct for a brand-new time entry (lands on today's active package), but a one-time bulk reallocation event re-ran that same logic against **historical** time entries going back to 2022, permanently re-pointing work done during prior, already-completed package terms onto whichever instance happened to be active on the day it ran.
- Isolated the event precisely: every row in `time_entry_allocations` with an unusual `created_at` clusters entirely within **2026-02-23 20:11 → 2026-02-24 09:19** (11 distinct minute-buckets, 28-94 rows each) — confirmed via a full-table scan for any other clustering (`having count(*) > 20` grouped by minute) that this is the *only* such event in the table's history. No migration file in the repo corresponds to it; it was not a tracked schema change. `PackageDataManager.tsx` (the SuperAdmin-only admin tool on the Packages tab) has no bulk-reallocation action — its only RPC call is `repair_package_instance_stages`, unrelated.
- Verified live on SHCS Academy (tenant 7408): the M-SAR/M-SAC memberships (started 2025-11-18) showed ~47.7h used against a 56-63h allowance; ~38.3h of that was time logged as far back as 2024-08-29, over a year before the instance existed.
- First blast-radius estimate was wrong and self-corrected before writing any fix: an initial query (pre-start-date allocations with no `is_billable`/`work_type` filter) found 26 active instances / 440 pre-term hours. Re-run with the exact filters `fn_package_used_minutes()` actually uses (`is_billable = true`, `work_type <> 'carry_over'`) narrowed this to **8 active instances, 5 tenants, 139.6 hours** — several of the original 26 (e.g. Wyatt Education Group, ratio 450%+) turned out to be entirely non-billable pre-term entries the real function was already correctly excluding. A ratio check (`pre_term_hours / total_hours_used` exceeding 100% is impossible if pre-term is a genuine subset) is what surfaced the flaw in the first query.
- Full dry-run across **all 1047** package_instances (not just active ones, to also correct the History tab view) found **21 instances change**, 0 go up, 0 go negative — the expected signature of a purely corrective fix.
- Ruled out two adjacent concerns before writing the fix: (1) the doc comment on `fn_package_used_minutes()` warning "never join `time_entries.package_id` against `package_instances.id` — not the same value space" — checked directly, 100% of current `time_entries.package_id` values match a real `package_instances.id`, none match only a `packages.id`; stale caution, not a live risk. (2) whether the underlying allocation split for combo RTO+CRICOS memberships double-counts a single time entry across both packages — checked directly, every "both"-scoped entry's two allocations sum back to exactly its own `duration_minutes`; conserved, not doubled.
- Two other callers of `fn_package_used_minutes()` exist (`tg_recalc_package_hours_used_from_allocation`, a sibling trigger on `time_entry_allocations`; `rpc_get_package_usage`, an RPC not called anywhere in the frontend) — both automatically benefit from the fix, neither needed separate changes.
- Fix deliberately narrow: added a `te.start_at >= pi.start_date` floor to both branches of the calculation. Did not touch the underlying `time_entry_allocations` rows (other reporting may depend on them) or change `allocate_time_entry()`'s "currently active" resolution logic (a live, latent risk if an old entry's `scope_tag`/`duration_minutes` is ever edited, triggering `fn_reallocate_time_entry` — flagged as parked, not fixed, since renewal itself doesn't trigger reallocation and the historical event was one-time). Included a one-time `UPDATE` recomputing all 1047 existing `hours_used` values with the trigger's own formula, since they don't self-correct without a new `time_entries` write.
- Route taken: **direct hand-written migration** (matches the standing session default per workspace CLAUDE.md). Applied via Supabase MCP; the auto-mode permission classifier did not block this second apply (had blocked the first migration of the day, requiring Carl's explicit confirmation via AskUserQuestion).

## KB changes shipped

- No changes.

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` @ `e21188b2` (branch `hotfix/fix-hours-used-predates-membership-start`, PR #90, merged to `main` at `06a85ab1`): migration `20260730030000_add_start_date_floor_to_package_used_minutes.sql`. No frontend changes.
- Applied directly to prod Supabase (project `yxkgdalkbrriasiyyrwk`) via the Supabase MCP tool before the PR was opened, with Carl's explicit approval. Verified post-migration: DB values for all 8 previously-flagged instances match the dry-run exactly (e.g. SHCS's two instances both 47.7h → 9.4h); live in the Client Detail Packages tab, SHCS Academy now reads "9.42/63 hrs used" and "9.42/56 hrs used" instead of "47.75/63" and "47.68/56".

## Decisions

- No ADRs drafted or resolved this session.

## Open questions parked

- **`allocate_time_entry()`'s lack of time-awareness is not itself fixed** — only its downstream effect on `hours_used` is. If someone edits an old time entry's `scope_tag` or `duration_minutes` today, `fn_reallocate_time_entry` will still re-run `allocate_time_entry()` and re-point that old entry onto whichever package is *currently* active, recreating a smaller-scale version of the same historical mis-filing. Confirmed this isn't triggered by renewal itself (checked `transition_membership_state`/`start_client_package`, neither calls anything allocation-related), so the residual risk is narrow (manual edits to old entries only) but real. Worth a proper fix to `allocate_time_entry()`/`get_active_membership_packages()` at some point — out of scope for today's narrowly-targeted display fix.
- **Who or what ran the 2026-02-23/24 bulk reallocation, and why** — not identified this session (no corresponding migration file, no UI feature found that would trigger it). Worth asking around if anyone recalls a manual data-fix or script run around that date.

## Tag

audit-2026-07-30-hours-used-pre-term-fix
