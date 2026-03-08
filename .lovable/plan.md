

## Fix Plan: Renewal Dialog — Two Issues

### Issue 1: `client_id` NOT NULL Error on Carry-Over Time Entry

**Root Cause**: In `RenewalConfirmDialog.tsx` line 111-124, the carry-over time entry insert sets `tenant_id` but omits `client_id`. The `time_entries` table requires both columns as NOT NULL.

**Fix**: Add `client_id: tenantId` to the insert object at line 113.

### Issue 2: Pre-check Stage Instances for Missing Status

**Requirement**: Before the renewal dialog opens, check if any `stage_instances` for the package instance have no status selected (status_id = 0 / status = 'not_started' or null). If any exist, show a warning toast and block the dialog from opening.

**Fix**: In `ClientPackagesTab.tsx`, replace the direct `setRenewTarget(pkg)` call with an async check:
1. Query `stage_instances` where `packageinstance_id = pkg.id` and `status_id IS NULL OR status_id = 0`
2. If any rows returned → show a toast error: "All stages must have a status before renewing"
3. If none → proceed with `setRenewTarget(pkg)`

### Files to Change

| File | Change |
|------|--------|
| `src/components/client/RenewalConfirmDialog.tsx` | Add `client_id: tenantId` to time entry insert |
| `src/components/client/ClientPackagesTab.tsx` | Add stage status pre-check before opening renewal dialog |

