# Audit: 2026-09-23 — Bulk-generate automation account lost two permissions in the 2026-09-15 System Account migration

**Trigger:** ad-hoc — Carl reported bulk-generate failing for Demo RTO, suspected a regression from his own codebase-optimization/RBAC work
**Scope:** `bulk-generate-automation@vivacity.com.au`'s effective permissions and everything the bulk-generate-documents-worker calls with them. Did not audit the other two accounts touched by the same 2026-09-15 migration (`admin@vivacity.com.au`, `angela+invitetest@vivacity.com.au`) beyond confirming this migration granted `System Account` zero `role_permissions` by design.

## Findings

- Live incident at the time of investigation: `bulk_document_job_items` for a Demo RTO (tenant 7547) job was stuck in state `leased`, `attempt_count` climbing rapidly, with the worker retrying `check-tenant-sharepoint-liveness` roughly every 1.7 seconds and getting HTTP 403 every time — a genuine retry storm, not a one-off failure.
- Root cause: migration `add_system_account_role_and_reclassify` (2026-09-15, part of the System Account / staff-picker hygiene sweep) reassigned `bulk-generate-automation@vivacity.com.au`'s primary `unicorn_role` from `Team Member` to the new `System Account` role. `System Account` deliberately has **zero** `role_permissions` rows (least-privilege default, per that migration's own comment). The migration's reasoning explicitly checked only `admin.documents.bulk_generate` (granted via a separate, untouched `Bulk Generate Automation` supplemental role) and concluded "its actual worker capability is unaffected" — but `Team Member` was also implicitly providing two other feature keys the worker's own call chain depends on, which nobody checked at the time:
  - `staff.sharepoint.use` — required by `check-tenant-sharepoint-liveness` and `verify-compliance-folder`, both called from `bulk-generate-documents-worker`'s `ensureSharepoint()` bootstrap step.
  - `staff.documents.generate` — required by `deliver-governance-document`, the final step of every job.
- Reproduced directly: `check_permission('e904192d-cfe7-425d-b946-eb11e4fb78f2', 'staff.sharepoint.use', 'full')` and the same call for `staff.documents.generate` both returned `false` before the fix, and confirmed `Team Member` (the account's role until 2026-09-15) grants both at `full`.
- The worker's own error classification makes this failure mode quiet rather than loud: a non-200/non-401 response from `check-tenant-sharepoint-liveness` is coded as `errorCode: 'liveness_check_failed', transient: true`, and a transient bootstrap failure "leaves it leased" for retry rather than failing the job outright — so every affected job silently spun forever instead of surfacing a clear error, and `bulk_document_jobs.generated_count`/`failed_count` never moved to show anything was wrong.
- This is why Carl's "bulk generate has worked for months" and "it's failing right now for Demo RTO" were both correct at once: `bulk_document_jobs` shows dozens of fully successful runs through late August (before the 2026-09-15 migration), and the automation account's permission gap dates from exactly that migration, one week later.
- Separately investigated and ruled out as unrelated: `ASQA_FPPR_Merge` (document #7454) not being pickable in Bulk Generate's document filter is a real but distinct, pre-existing issue — that document's `document_versions` row has an empty `storage_path` and no `source_template_url` (created 2026-01-13, long before the SharePoint-import flow existed), so it has never had a real file backing it regardless of this permissions regression. 371 documents catalogue-wide share that same gap; disposition still open with Carl.

## Code changes (if this entry accompanies one)

- Migration `fix_bulk_generate_automation_missing_sharepoint_and_document_generate_permissions` (applied 2026-09-23): grants `staff.sharepoint.use` and `staff.documents.generate` at `full` to the existing `Bulk Generate Automation` supplemental role (the precedent the 2026-09-15 migration itself established), rather than granting anything to the shared `System Account` role — keeps the other two system accounts on that role at zero permissions, matching the original least-privilege intent.
- Verified live post-fix: `check-tenant-sharepoint-liveness` returned 200 for the first request after the grant landed, and the previously-stuck Demo RTO job (`6cbf0bc2-b8cc-43ce-9911-fbff9a3759cc`) completed (`processed=1, remaining=0`) within seconds.

## Decisions

- None beyond the fix above — no policy question, just a missed permission dependency.

## Open questions parked

- Whether `is_vivacity_team_safe()`-gated calls elsewhere in the codebase (which this account still passes, since that check is role-`is_internal`-based rather than `role_permissions`-based) mask other latent `role_permissions` gaps for `admin@vivacity.com.au` or `angela+invitetest@vivacity.com.au` from the same 2026-09-15 migration was not swept this session.
- General process gap: a migration that reclassifies an automation account's role should grep every edge function/worker that authenticates as that account for every `featureKey`/`requireCaller` call in its full downstream chain, not just the one capability the PR is about — worth considering as a standing checklist item for any future system-account role change.
