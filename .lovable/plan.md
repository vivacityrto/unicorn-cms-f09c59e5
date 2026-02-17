

# Fix: 404 on `/admin/tenant/:id` routes

## Problem

The tenant detail page is registered at `/tenant/:tenantId`, but several components generate links to `/admin/tenant/:tenantId` -- a route that does not exist, causing a 404.

## Root Cause

Links in `TenantDrawer.tsx` (and potentially other components) use the path `/admin/tenant/${id}` instead of `/tenant/${id}`.

## Fix

### 1. Update TenantDrawer.tsx

Replace all occurrences of `/admin/tenant/${tenant.tenant_id}` with `/tenant/${tenant.tenant_id}` (approximately 3 instances in this file).

### 2. Scan for other broken references

Check all components that link to `/admin/tenant/` and correct them to `/tenant/`. Known files to check:
- `src/components/portfolio/TenantDrawer.tsx` (confirmed broken)
- Any dashboard or portfolio components that navigate to tenant detail

### 3. No database or schema changes required

This is a frontend routing fix only.

## Technical Details

```text
Current (broken):  navigate(`/admin/tenant/${id}`)
Fixed:             navigate(`/tenant/${id}`)
```

Three link instances in `TenantDrawer.tsx` at approximately lines 94, 185, and 233 need updating. A broader search will confirm if other files have the same issue.
