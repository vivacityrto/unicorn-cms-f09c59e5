# Audit: 2026-08-24 — bulk-generate-automation-permission

**Trigger:** ad-hoc production incident follow-up
**Scope:** Bulk document generation job `85e00e30-ac1f-472b-84f2-6040f6c1847f`, the remaining SharePoint provisioning failures for tenants `7494` and `7550`, and the RBAC role needed by the dedicated bulk-generation automation account.

## Findings
- Job `85e00e30-ac1f-472b-84f2-6040f6c1847f` was not blocked by a missing root folder link. It was looping on two `Course Flyer Checklist` items because `provision-tenant-sharepoint-folder` returned HTTP `403` on every worker retry.
- The worker authenticates downstream staff-gated calls as `bulk-generate-automation@vivacity.com.au`, whose primary `unicorn_role` is `Team Member`.
- `Team Member` already has `staff.documents.generate` and `staff.sharepoint.use`, which is why liveness and governance-folder verification pass their gates, but `provision-tenant-sharepoint-folder` is currently gated on `admin.documents.bulk_generate`.
- No `role_permissions` row existed for `admin.documents.bulk_generate`; only Super Admin would pass via the `check_permission` super-admin override. Promoting the automation account to Super Admin would have fixed the symptom but granted far more authority than the worker needs.

## KB changes shipped
- No changes.

## Code changes
- Added and applied a migration that creates a dedicated supplemental `Bulk Generate Automation` role dictionary entry, grants it `admin.documents.bulk_generate = full`, and assigns that role to `bulk-generate-automation@vivacity.com.au`.

## Verification
- Verified `public.check_permission('e904192d-cfe7-425d-b946-eb11e4fb78f2', 'admin.documents.bulk_generate', 'full')` returns `true`.
- Verified the `Bulk Generate Automation` supplemental role is assigned to the automation account and carries only the `admin.documents.bulk_generate = full` grant added by this migration.
- Rechecked job `85e00e30-ac1f-472b-84f2-6040f6c1847f` after the migration: it completed at `2026-08-24 00:41:57.540019+00` with `8,582` generated, `55` skipped, and `0` failed; no non-terminal job items remained.

## Decisions
- Preserve the automation account's primary role as `Team Member`.
- Use an additive `user_roles` grant rather than broadening all Team Members or assigning Super Admin.

## Open questions parked
- The worker still treats repeated transient bootstrap/provisioning failures as lease churn with no bounded terminal path. That should be handled in a separate reliability patch so a future authorization or SharePoint outage cannot spin a job indefinitely.
