# Audit: 2026-07-06 — farsta-package-burndown-renewal-date

**Trigger:** ad-hoc (user-reported: "burn down chart doesn't seem to be working" for two clients)
**Scope:** Diagnosed and fixed a data anomaly on `package_instances.next_renewal_date` for Finance and Related Services Training Academy Pty Ltd (tenant 7486), and backfilled one orphaned `time_entries` row for Arrow Training Services (tenant 6346). Did not touch `unicorn-kb/` or `unicorn-cms-f09c59e5/` (front-end code was not the defect in either case).

## Findings
- Two clients reported: Arrow Training Services and Finance and Related Services Training Academy Pty Ltd.
- **Arrow Training Services (tenant 6346):** the "Package Burn-down" widget showed 0:00 / 7:00 used. 10 of its 11 logged time entries since 2024 (~24 hours) are genuinely `is_billable = false` — correctly excluded, not a bug. But the 11th entry (`time_entries.id = 1d1daab4-b918-4d57-805f-663bcf184226`, 10 min, `work_type = 'phone-call'`, `source = 'manual'`, `is_billable = true`, notes "Follow up on staged mock audit plan with Arrow", created 2026-03-16) was excluded for an unrelated reason: `package_instance_id` and `start_at` were both `null`, even though `package_id` correctly pointed at the current package instance (15174). Both burndown surfaces silently drop rows with a null `package_instance_id`/`start_at` rather than erroring. Checked the three manual-entry save paths in the codebase (`AddTimeDialog.tsx`, both branches of `ClientStructuredNotesTab.tsx`, `EditTimeDialog.tsx`) — all three correctly set both fields together, so the exact save path that produced this row was not identified. No linked `notes` row either. Root cause of the orphaned insert itself is unresolved; only the row was repaired.
- **Finance and Related Services Training Academy Pty Ltd (tenant 7486):** the "Package Burn-down" widget showed 0:00 / 56:00 used despite 34:13 billable hours logged in the last 90 days (correctly visible in the separate "Time Summary" card on the same page).
- Root cause (Finance): `rpc_get_package_usage()` computes the "current membership year" window as `[next_renewal_date − 1 year, next_renewal_date)`. `package_instances.id = 15101` ("Sapphire RTO Membership", tenant 7486, `start_date = 2025-06-13`) had `next_renewal_date = 2027-06-13` — a 730-day gap from `start_date`, vs. the 365-day gap on every other active/historical instance of the same package (checked 8 sibling rows on `packages.id = 1033`). This pushed the RPC's date window to `2026-06-13`–`2027-06-13`, entirely after all of the client's actual logged time (`2025-06-20` through `2026-06-09`), so both the billable-only total and the unfiltered billable/non-billable breakdown returned zero.
- Confirmed live in the browser (Carl's Super Admin session) before and after each fix:
  - Finance: "Used 0:00 / 56:00" → "Used 27:15 / 56:00 (49%)".
  - Arrow: "Used 0:00 / 7:00" → "Used 0:10 / 7:00 (2%)", Billable 0:10, Manual 0:10.

## KB changes shipped
- no changes

## Codebase observations (read-only)
- unicorn-cms-f09c59e5 @ a31ecb9f6ad9cf7c6f89dfeb1342553c883977d4: `ClientTimeSummaryCard.tsx` (renders the "Package Burn-down" widget) and `usePackageUsageQuery.tsx` (calls the `rpc_get_package_usage` RPC) were not at fault for the Finance issue — front-end code faithfully renders whatever the RPC returns. For Arrow, the client-portal chart (`PackageBurndownChart.tsx` via `use-client-package-hours-timeline.ts`, filtered on the `v_client_package_hours_timeline` view's `package_instance_id IS NOT NULL`) and the same staff RPC both silently drop rows with null `package_instance_id`/`start_at` — worth a follow-up on whether that should surface as a data-quality warning instead of silent omission.

## Decisions
- Applied both fixes as direct Supabase data corrections (single-row `UPDATE`s) rather than Lovable prompts. Neither was new schema/RLS/trigger authorship, so the root `CLAUDE.md` "Lovable production DB change sessions" protocol — which targets sessions heading toward generating a Lovable prompt — was judged not to apply; still logging here per this repo's "production DB change" intent. Consistent with the precedent set in `audit/2026-07-02-task-completion-trigger-null-package.md`.
- Ran a dry-run `SELECT` confirming the exact target row before each write, and got explicit user confirmation of the precise `UPDATE` statement before executing each one (both guarded so they'd only fire if the row was unchanged since diagnosis).
- Finance fix applied: `UPDATE package_instances SET next_renewal_date = '2026-06-13' WHERE id = 15101 AND next_renewal_date = '2027-06-13'` against project `yxkgdalkbrriasiyyrwk`.
- Arrow fix applied: `UPDATE time_entries SET package_instance_id = 15174, start_at = created_at WHERE id = '1d1daab4-b918-4d57-805f-663bcf184226' AND package_instance_id IS NULL AND start_at IS NULL` against the same project. `start_at` was backfilled to the row's own `created_at` (2026-03-16 04:41:42 UTC) since no real call time was ever recorded.
- Neither wrapped in a migration — both are one-off value corrections, not schema or function changes.

## Open questions parked
- How did `next_renewal_date` end up 730 days after `start_date` instead of 365 for the Finance package instance? Not investigated — could be a double-renewal click, a manual edit, or a one-off import glitch. Worth a follow-up audit if the pattern recurs on other tenants.
- How did the Arrow time entry get inserted with `package_instance_id`/`start_at` null while `package_id` was correctly set? None of the three manual-entry save paths found in the codebase produce that shape. Worth a follow-up audit — possibly an edge function, a partially-failed insert, or a code path not yet found.
- Arrow Training Services' 10 remaining non-billable time entries (~24 hours) — flagged for Carl to follow up with the CSC/team who logs time for that client, not resolved this session.

## Tag
audit-2026-07-06-farsta-package-burndown-renewal-date
